from __future__ import annotations

from .contracts import (
    ClientProfile,
    TemplateDefinition,
    TrialBlueprint,
    TrialBlueprintBatchRequest,
    TrialBlueprintBatchResponse,
    TrialBlueprintRequest,
)


def _template(
    template_id: str,
    product: str,
    title: str,
    operator: str,
    outcome: str,
    data_request: list[str],
    first_run: list[str],
    acceptance_checks: list[str],
    allowed_source_kinds: list[str],
) -> TemplateDefinition:
    return TemplateDefinition(
        template_id=template_id,
        product=product,  # type: ignore[arg-type]
        title=title,
        operator=operator,
        outcome=outcome,
        data_request=data_request,
        first_run=first_run,
        acceptance_checks=acceptance_checks,
        allowed_source_kinds=allowed_source_kinds,  # type: ignore[arg-type]
    )


TEMPLATES: dict[str, TemplateDefinition] = {
    "shop.daily-close": _template(
        "shop.daily-close",
        "shop",
        "Daily close review",
        "Shop manager",
        "A named daily close checklist with exceptions ready for manager review.",
        ["One sample sales close", "Cash and payment exception notes", "Named closer and manager"],
        ["Select the shop/site", "Load one supplied close packet", "Review exceptions", "Approve the final close outside this service"],
        ["Every exception has a source note", "No receipt, payment, or ledger entry is changed", "Manager can identify the next review action"],
        ["provided_text", "imported_export", "connector_export"],
    ),
    "shop.reorder-review": _template(
        "shop.reorder-review",
        "shop",
        "Reorder review",
        "Buyer or shop manager",
        "A low-stock review that separates evidence, proposed orders, and approval.",
        ["Product list with stock counts", "Supplier/order constraints", "Reorder owner"],
        ["Load the approved stock export", "Review suggested shortages", "Create a draft order list", "Approve and send outside this service"],
        ["Draft quantities cite the supplied export", "No supplier order is sent", "Buyer can accept, edit, or reject each proposal"],
        ["provided_text", "imported_export", "connector_export"],
    ),
    "shop.customer-credit": _template(
        "shop.customer-credit",
        "shop",
        "Customer credit follow-up review",
        "Credit controller",
        "An evidence-backed customer credit review with draft follow-up actions.",
        ["Approved receivables export", "Customer follow-up policy", "Named review owner"],
        ["Load the supplied receivables export", "Review overdue items", "Draft follow-up priorities", "Approve any contact outside this service"],
        ["No customer is contacted", "Every priority is linked to supplied evidence", "Credit owner can mark the review complete"],
        ["provided_text", "imported_export", "connector_export"],
    ),
    "shop.receiving-evidence": _template(
        "shop.receiving-evidence",
        "shop",
        "Receiving evidence review",
        "Receiver or shop manager",
        "A receipt-ready evidence review that keeps stock movement, cost evidence, and approval separate.",
        ["Delivery or invoice reference", "Named receiver", "Item and documented unit-cost details"],
        ["Load the supplied receipt evidence", "Check item, cost, and receiver details", "Draft any missing-evidence actions", "Post the receipt only in the approved Shop workflow"],
        ["No stock count is changed", "Documented cost and delivery evidence are visible", "Manager can approve or reject the receipt outside this service"],
        ["provided_text", "imported_export", "connector_export"],
    ),
    "plant.shift-handoff": _template(
        "plant.shift-handoff",
        "plant",
        "Shift handoff review",
        "Shift supervisor",
        "A clear next-shift packet with open issues, owners, and evidence.",
        ["Shift notes", "Machine or line status", "Named outgoing and incoming supervisors"],
        ["Load the shift notes", "Identify open production, quality, and maintenance items", "Draft handoff", "Supervisor confirms handoff outside this service"],
        ["Every exception names an owner", "No work order or machine state is changed", "Incoming supervisor can see what needs confirmation"],
        ["provided_text", "chat_transcript", "imported_export", "connector_export"],
    ),
    "plant.work-order-evidence": _template(
        "plant.work-order-evidence",
        "plant",
        "Work-order evidence review",
        "Maintenance or production lead",
        "A start-to-close evidence checklist for a work order before final approval.",
        ["Work-order event history", "Starter, closer, and evidence references", "Supervisor approval criteria"],
        ["Load the supplied work-order record", "Check start and close evidence", "Draft missing-evidence actions", "Complete or reopen outside this service"],
        ["No work order is closed", "Missing starter or closeout evidence is called out", "Supervisor can approve a next action"],
        ["provided_text", "imported_export", "connector_export"],
    ),
    "plant.iso-capa": _template(
        "plant.iso-capa",
        "plant",
        "ISO and CAPA review",
        "Quality manager",
        "A non-conformance to corrective-action review that keeps containment, evidence, and approvals distinct.",
        ["Non-conformance record", "Containment evidence", "Root-cause and corrective-action evidence", "Quality owner"],
        ["Load the supplied incident packet", "Identify evidence gaps", "Draft CAPA review actions", "Approve closure outside this service"],
        ["No CAPA is closed automatically", "Containment and root-cause evidence remain separate", "Quality owner has explicit review items"],
        ["provided_text", "chat_transcript", "imported_export", "connector_export"],
    ),
    "plant.maintenance-review": _template(
        "plant.maintenance-review",
        "plant",
        "Maintenance exception review",
        "Maintenance planner",
        "A reviewed maintenance queue that distinguishes evidence, priority, and work authorization.",
        ["Machine event notes", "Open maintenance work", "Planner and approver"],
        ["Load supplied maintenance notes", "Group recurring issues", "Draft prioritised queue", "Authorize work outside this service"],
        ["No machine record is edited", "Priority is explained from supplied notes", "Approver can accept or reject each item"],
        ["provided_text", "chat_transcript", "imported_export", "connector_export"],
    ),
    "agent.inbox-brief": _template(
        "agent.inbox-brief",
        "agent",
        "Inbox decision brief",
        "Founder, manager, or chief of staff",
        "A short, evidence-linked decision brief from approved email excerpts.",
        ["Customer-provided email excerpts or approved connector export", "Question to answer", "Review owner"],
        ["Paste or export approved excerpts", "Ask one decision question", "Review the draft", "Approve any reply or workflow outside this service"],
        ["The service never opens Gmail", "Every factual claim cites a supplied excerpt", "No email is sent"],
        ["provided_text", "imported_export", "connector_export"],
    ),
    "agent.drive-brief": _template(
        "agent.drive-brief",
        "agent",
        "Drive knowledge brief",
        "Founder, manager, or analyst",
        "A concise decision brief from customer-provided document excerpts.",
        ["Approved document excerpts or approved export", "Question to answer", "Review owner"],
        ["Paste or export selected excerpts", "Ask one decision question", "Review cited evidence", "Approve follow-up outside this service"],
        ["The service never opens Drive", "Every factual claim cites a supplied excerpt", "No document is altered"],
        ["provided_text", "imported_export", "connector_export"],
    ),
    "agent.chat-summary": _template(
        "agent.chat-summary",
        "agent",
        "Chat decision summary",
        "Team lead",
        "A structured summary of a supplied chat transcript with decision gaps and approval-required next actions.",
        ["Customer-provided chat transcript", "Question to answer", "Review owner"],
        ["Paste the selected transcript", "Ask one review question", "Review cited decisions and gaps", "Approve any follow-up outside this service"],
        ["The service never opens chat platforms", "Actions stay draft-only", "Unresolved ownership is visible"],
        ["provided_text", "chat_transcript"],
    ),
    "agent.approved-web-brief": _template(
        "agent.approved-web-brief",
        "agent",
        "Approved website research brief",
        "Research or commercial lead",
        "A source-aware brief from customer-supplied extracts of explicitly approved websites.",
        ["Approved page extracts", "Source owner and permitted-use status", "Research question"],
        ["Paste approved extracts", "Ask one research question", "Review source citations", "Approve any follow-up or collection outside this service"],
        ["The service does not fetch pages", "Every claim cites supplied extracts", "No lead is contacted"],
        ["approved_web_extract", "provided_text"],
    ),
}


def list_templates() -> list[TemplateDefinition]:
    return [TEMPLATES[key] for key in sorted(TEMPLATES)]


def get_template(template_id: str) -> TemplateDefinition:
    try:
        return TEMPLATES[template_id]
    except KeyError as error:
        raise ValueError(f"Unknown template_id: {template_id}") from error


def _workspace_config(template: TemplateDefinition, client: ClientProfile) -> list[str]:
    systems = ", ".join(client.working_systems) if client.working_systems else "the supplied trial evidence"
    constraints = "; ".join(client.operating_constraints) if client.operating_constraints else "no additional constraints supplied"
    return [
        f"Configure {template.title} for {client.business_name} across {client.site_count} site(s).",
        f"Set {client.operator_role} as the human review owner.",
        f"Use {systems}; connector access is not enabled by this blueprint.",
        f"Record operating constraints: {constraints}.",
        "Keep the trial isolated until an approved backend and account flow exist.",
    ]


def build_trial_blueprint(request: TrialBlueprintRequest) -> TrialBlueprint:
    template = get_template(request.template_id)
    return TrialBlueprint(
        template=template,
        workspace_config=_workspace_config(template, request.client),
        first_run=template.first_run,
        data_request=template.data_request,
        acceptance_checks=template.acceptance_checks,
    )


def build_trial_blueprints(request: TrialBlueprintBatchRequest) -> TrialBlueprintBatchResponse:
    blueprints = [build_trial_blueprint(trial) for trial in request.trials]
    return TrialBlueprintBatchResponse(
        blueprint_count=len(blueprints),
        blueprints=blueprints,
    )
