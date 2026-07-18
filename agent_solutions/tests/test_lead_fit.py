from agent_solutions.contracts import LeadFitRequest
from agent_solutions.lead_fit import score_leads


def test_imported_permitted_plant_lead_is_review_only() -> None:
    response = score_leads(
        LeadFitRequest(
            leads=[
                {
                    "lead_id": "plant-1",
                    "business_name": "Example Factory",
                    "industry": "Manufacturing",
                    "permission_status": "customer_approved",
                    "source_owner": "Customer import",
                }
            ]
        )
    )
    fit = response.fits[0]
    assert fit.disposition == "review"
    assert fit.recommended_product == "plant"
    assert fit.outreach_state == "not_started"


def test_do_not_contact_lead_stays_suppressed() -> None:
    response = score_leads(
        LeadFitRequest(
            leads=[
                {
                    "lead_id": "suppressed-1",
                    "business_name": "Example Shop",
                    "industry": "Retail",
                    "permission_status": "customer_approved",
                    "do_not_contact": True,
                }
            ]
        )
    )
    assert response.fits[0].disposition == "suppressed"
    assert response.fits[0].fit_score == 0
