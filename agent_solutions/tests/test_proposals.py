from agent_solutions.contracts import ActionProposalRequest
from agent_solutions.proposals import build_action_proposal


def test_computer_use_is_proposal_only() -> None:
    proposal = build_action_proposal(
        ActionProposalRequest(
            template_id="agent.chat-summary",
            requested_outcome="Review a supplied team decision.",
            target_surface="mobile",
            target_description="Approved customer mobile app",
        )
    )
    assert proposal.execution_state == "not_started"
    assert proposal.required_approvals
    assert "computer action has been taken" in proposal.approval_boundary
