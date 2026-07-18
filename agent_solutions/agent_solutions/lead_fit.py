from __future__ import annotations

from .contracts import LeadFit, LeadFitRequest, LeadFitResponse, LeadImportRow
from .policy import lead_disposition


SHOP_TERMS = ("retail", "shop", "store", "market", "wholesale", "distribution", "distributor")
PLANT_TERMS = ("factory", "manufactur", "plant", "production", "industrial", "warehouse")
AGENT_TERMS = ("consult", "services", "agency", "professional", "office", "team")


def _searchable(lead: LeadImportRow) -> str:
    return " ".join(
        part.lower()
        for part in (lead.business_name, lead.industry, lead.city, lead.public_summary)
        if part
    )


def _recommendation(lead: LeadImportRow) -> tuple[str, list[str], list[str], int]:
    haystack = _searchable(lead)
    reasons: list[str] = []
    score = 20

    if any(term in haystack for term in PLANT_TERMS):
        reasons.append("Industry signals fit Plant operating templates.")
        return "plant", ["plant.shift-handoff", "plant.iso-capa"], reasons, score + 40
    if any(term in haystack for term in SHOP_TERMS):
        reasons.append("Industry signals fit Shop operating templates.")
        return "shop", ["shop.daily-close", "shop.reorder-review"], reasons, score + 40
    if any(term in haystack for term in AGENT_TERMS):
        reasons.append("Work pattern signals fit supervised insight templates.")
        return "agent", ["agent.inbox-brief", "agent.chat-summary"], reasons, score + 25

    reasons.append("Insufficient sector detail; a human needs to select the first template.")
    return "review", [], reasons, score


def score_lead(lead: LeadImportRow) -> LeadFit:
    disposition = lead_disposition(lead)
    product, templates, reasons, score = _recommendation(lead)

    if lead.source_url:
        score += 10
        reasons.append("Imported row retains a source URL for review.")
    if lead.source_owner:
        score += 10
        reasons.append("Imported row names a source owner.")

    if disposition == "blocked":
        return LeadFit(
            lead_id=lead.lead_id,
            business_name=lead.business_name,
            disposition="blocked",
            fit_score=0,
            recommended_product="review",
            recommended_template_ids=[],
            reasons=["Permitted-use status is not confirmed; this lead cannot enter a campaign."] + reasons,
            source_status=lead.permission_status,
        )
    if disposition == "suppressed":
        return LeadFit(
            lead_id=lead.lead_id,
            business_name=lead.business_name,
            disposition="suppressed",
            fit_score=0,
            recommended_product="review",
            recommended_template_ids=[],
            reasons=["The imported row is marked do_not_contact and remains suppressed."] + reasons,
            source_status=lead.permission_status,
        )

    return LeadFit(
        lead_id=lead.lead_id,
        business_name=lead.business_name,
        disposition="review",
        fit_score=min(score, 100),
        recommended_product=product,  # type: ignore[arg-type]
        recommended_template_ids=templates,
        reasons=reasons,
        source_status=lead.permission_status,
    )


def score_leads(request: LeadFitRequest) -> LeadFitResponse:
    return LeadFitResponse(fits=[score_lead(lead) for lead in request.leads])
