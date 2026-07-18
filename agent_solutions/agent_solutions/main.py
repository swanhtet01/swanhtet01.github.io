from __future__ import annotations

import argparse
import asyncio
import json
import os

import uvicorn
from fastapi import FastAPI, HTTPException

from .contracts import (
    ActionProposal,
    ActionProposalRequest,
    InsightBriefRequest,
    InsightBriefResponse,
    LeadFitRequest,
    LeadFitResponse,
    TemplateDefinition,
    TrialBlueprint,
    TrialBlueprintRequest,
)
from .lead_fit import score_leads
from .policy import PolicyViolation
from .proposals import build_action_proposal
from .runtime import (
    AgentNotConfigured,
    AgentQuotaUnavailable,
    is_configured,
    run_insight_brief,
    smoke_brief_request,
)
from .templates import build_trial_blueprint, list_templates


app = FastAPI(
    title="SuperMega Agent Solutions",
    version="0.1.0",
    description="Review-gated templates, trial plans, source-aware lead fit, and insight briefs.",
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ready",
        "service": "supermega-agent-solutions",
        "model_configured": is_configured(),
        "persistence": "disabled",
        "connectors": "disabled",
        "computer_use": "proposal_only",
    }


@app.get("/v1/templates", response_model=list[TemplateDefinition])
async def templates() -> list[TemplateDefinition]:
    return list_templates()


@app.post("/v1/trial-blueprints", response_model=TrialBlueprint)
async def trial_blueprints(request: TrialBlueprintRequest) -> TrialBlueprint:
    try:
        return build_trial_blueprint(request)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/v1/lead-fit", response_model=LeadFitResponse)
async def lead_fit(request: LeadFitRequest) -> LeadFitResponse:
    return score_leads(request)


@app.post("/v1/action-proposals", response_model=ActionProposal)
async def action_proposals(request: ActionProposalRequest) -> ActionProposal:
    try:
        return build_action_proposal(request)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/v1/briefs", response_model=InsightBriefResponse)
async def briefs(request: InsightBriefRequest) -> InsightBriefResponse:
    try:
        brief = await run_insight_brief(request)
    except PolicyViolation as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except AgentNotConfigured as error:
        raise HTTPException(status_code=503, detail="Insight Reader is not configured.") from error
    except AgentQuotaUnavailable as error:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "model_quota_unavailable",
                "message": "Insight Reader is configured but the OpenAI project has no available quota.",
            },
        ) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Insight Reader could not produce a brief.") from error
    return InsightBriefResponse(
        template_id=request.template_id,
        sources_reviewed=[source.source_id for source in request.sources],
        brief=brief,
    )


def _deterministic_smoke() -> dict[str, object]:
    trial = build_trial_blueprint(TrialBlueprintRequest(template_id="shop.daily-close"))
    lead_fits = score_leads(
        LeadFitRequest(
            leads=[
                {
                    "lead_id": "synthetic-shop-1",
                    "business_name": "Synthetic Market",
                    "industry": "Retail store",
                    "source_url": "https://example.invalid/synthetic-market",
                    "source_owner": "Synthetic import",
                    "permission_status": "customer_provided",
                }
            ]
        )
    )
    proposal = build_action_proposal(
        ActionProposalRequest(
            template_id="agent.chat-summary",
            requested_outcome="Prepare a review of the supplied chat decision.",
            target_surface="browser",
            target_description="An approved demo workspace",
            approved_domains=["demo.supermega.dev"],
        )
    )
    assert trial.trial_state == "not_created"
    assert lead_fits.fits[0].outreach_state == "not_started"
    assert proposal.execution_state == "not_started"
    return {
        "status": "ready",
        "templates": len(list_templates()),
        "trial_state": trial.trial_state,
        "lead_disposition": lead_fits.fits[0].disposition,
        "action_execution_state": proposal.execution_state,
    }


async def _agent_smoke() -> dict[str, object]:
    brief = await run_insight_brief(smoke_brief_request())
    assert brief.approval_boundary
    return {
        "status": "ready",
        "evidence_count": len(brief.evidence),
        "risk_count": len(brief.risks),
        "action_count": len(brief.next_actions),
        "approval_boundary": brief.approval_boundary,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the SuperMega Agent Solutions API.")
    parser.add_argument("--smoke", action="store_true", help="Run deterministic boundary checks and exit.")
    parser.add_argument("--agent-smoke", action="store_true", help="Run one synthetic OpenAI Insight Reader check and exit.")
    args = parser.parse_args()

    if args.smoke:
        print(json.dumps(_deterministic_smoke(), indent=2))
        return 0
    if args.agent_smoke:
        try:
            print(json.dumps(asyncio.run(_agent_smoke()), indent=2))
            return 0
        except AgentQuotaUnavailable:
            print(
                json.dumps(
                    {
                        "status": "blocked",
                        "code": "model_quota_unavailable",
                        "message": "The configured OpenAI project has no available quota.",
                    },
                    indent=2,
                )
            )
            return 2

    uvicorn.run("agent_solutions.main:app", host="127.0.0.1", port=int(os.getenv("PORT", "8080")), reload=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
