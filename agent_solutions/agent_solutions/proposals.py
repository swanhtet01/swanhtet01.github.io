from __future__ import annotations

from .contracts import ActionProposal, ActionProposalRequest
from .templates import get_template


def build_action_proposal(request: ActionProposalRequest) -> ActionProposal:
    template = get_template(request.template_id)
    domains = [domain.strip().lower() for domain in request.approved_domains if domain.strip()]
    return ActionProposal(
        target_surface=request.target_surface,
        requested_outcome=request.requested_outcome,
        approved_domains=domains,
        proposal_steps=[
            f"Confirm that {request.target_description} is the intended {request.target_surface} target.",
            f"Review the requested outcome against the {template.title} approval boundary.",
            "Show the exact proposed actions, inputs, and expected changes before any execution.",
            "Require a human approval token for the specific target and action list.",
            "Record an auditable result only after a future approved executor is available.",
        ],
        required_approvals=[
            "Target identity and permitted scope",
            "Authenticated user/session handling",
            "Exact action list and expected side effects",
            "Any message, payment, record change, download, upload, or submission",
        ],
    )
