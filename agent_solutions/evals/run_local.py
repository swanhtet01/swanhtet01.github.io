from __future__ import annotations

from agent_solutions.contracts import ActionProposalRequest, LeadFitRequest, TrialBlueprintRequest
from agent_solutions.lead_fit import score_leads
from agent_solutions.proposals import build_action_proposal
from agent_solutions.templates import build_trial_blueprint


def main() -> int:
    trial = build_trial_blueprint(TrialBlueprintRequest(template_id="plant.iso-capa"))
    lead = score_leads(
        LeadFitRequest(
            leads=[
                {
                    "lead_id": "eval-plant",
                    "business_name": "Example Factory",
                    "industry": "Manufacturing",
                    "permission_status": "customer_approved",
                }
            ]
        )
    ).fits[0]
    proposal = build_action_proposal(
        ActionProposalRequest(
            template_id="agent.inbox-brief",
            requested_outcome="Prepare a follow-up review.",
            target_surface="browser",
            target_description="Approved demo workspace",
        )
    )
    assert trial.trial_state == "not_created"
    assert lead.disposition == "review"
    assert proposal.execution_state == "not_started"
    print("Agent Solutions local policy evals passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
