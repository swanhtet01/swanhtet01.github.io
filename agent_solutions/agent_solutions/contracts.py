from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


APPROVAL_BOUNDARY = (
    "Draft only. No email, chat message, web request, account change, data write, "
    "or computer action has been taken."
)

PermissionStatus = Literal[
    "customer_provided",
    "customer_approved",
    "not_confirmed",
    "prohibited",
]
SourceKind = Literal[
    "provided_text",
    "chat_transcript",
    "imported_export",
    "approved_web_extract",
    "connector_export",
]


class TemplateDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)

    template_id: str
    product: Literal["shop", "plant", "agent"]
    title: str
    operator: str
    outcome: str
    data_request: list[str]
    first_run: list[str]
    acceptance_checks: list[str]
    allowed_source_kinds: list[SourceKind]
    approval_boundary: str = APPROVAL_BOUNDARY


class ClientProfile(BaseModel):
    business_name: str = Field(default="Prospective client", min_length=1, max_length=120)
    sector: str = Field(default="", max_length=120)
    site_count: int = Field(default=1, ge=1, le=1000)
    operator_role: str = Field(default="Operations lead", min_length=1, max_length=120)
    working_systems: list[str] = Field(default_factory=list, max_length=12)
    operating_constraints: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("working_systems", "operating_constraints")
    @classmethod
    def compact_string_list(cls, values: list[str]) -> list[str]:
        return [str(value).strip() for value in values if str(value).strip()][:12]


class TrialBlueprintRequest(BaseModel):
    template_id: str = Field(min_length=3, max_length=80)
    client: ClientProfile = Field(default_factory=ClientProfile)


class TrialBlueprint(BaseModel):
    status: Literal["ready"] = "ready"
    trial_state: Literal["not_created"] = "not_created"
    template: TemplateDefinition
    workspace_config: list[str]
    first_run: list[str]
    data_request: list[str]
    acceptance_checks: list[str]
    approval_boundary: str = APPROVAL_BOUNDARY


class TrialBlueprintBatchRequest(BaseModel):
    trials: list[TrialBlueprintRequest] = Field(min_length=1, max_length=1000)


class TrialBlueprintBatchResponse(BaseModel):
    status: Literal["ready"] = "ready"
    trial_state: Literal["not_created"] = "not_created"
    blueprint_count: int = Field(ge=1, le=1000)
    blueprints: list[TrialBlueprint]
    approval_boundary: str = APPROVAL_BOUNDARY


class LeadImportRow(BaseModel):
    lead_id: str = Field(min_length=1, max_length=80)
    business_name: str = Field(min_length=1, max_length=180)
    industry: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    public_summary: str = Field(default="", max_length=3000)
    website: str = Field(default="", max_length=500)
    source_url: str = Field(default="", max_length=500)
    source_owner: str = Field(default="", max_length=160)
    permission_status: PermissionStatus
    do_not_contact: bool = False


class LeadFitRequest(BaseModel):
    leads: list[LeadImportRow] = Field(min_length=1, max_length=1000)


class LeadFit(BaseModel):
    lead_id: str
    business_name: str
    disposition: Literal["review", "suppressed", "blocked"]
    fit_score: int = Field(ge=0, le=100)
    recommended_product: Literal["shop", "plant", "agent", "review"]
    recommended_template_ids: list[str]
    reasons: list[str]
    source_status: PermissionStatus
    outreach_state: Literal["not_started"] = "not_started"
    approval_boundary: str = APPROVAL_BOUNDARY


class LeadFitResponse(BaseModel):
    status: Literal["ready"] = "ready"
    fits: list[LeadFit]
    approval_boundary: str = APPROVAL_BOUNDARY


class SourceItem(BaseModel):
    source_id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)
    source_kind: SourceKind
    permission_status: PermissionStatus
    source_owner: str = Field(min_length=1, max_length=160)
    source_ref: str = Field(default="", max_length=500)
    text: str = Field(min_length=1, max_length=12000)


class InsightBriefRequest(BaseModel):
    template_id: str = Field(min_length=3, max_length=80)
    question: str = Field(default="", max_length=1200)
    sources: list[SourceItem] = Field(min_length=1, max_length=12)


class EvidenceItem(BaseModel):
    source_id: str = Field(min_length=1, max_length=80)
    claim: str = Field(min_length=1, max_length=800)
    excerpt: str = Field(min_length=1, max_length=500)


class RiskItem(BaseModel):
    risk: str = Field(min_length=1, max_length=800)
    evidence_source_ids: list[str] = Field(default_factory=list, max_length=8)


class ActionDraft(BaseModel):
    action: str = Field(min_length=1, max_length=800)
    intended_outcome: str = Field(min_length=1, max_length=800)
    requires_approval: Literal[True] = True


class InsightBrief(BaseModel):
    executive_summary: str = Field(min_length=1, max_length=1800)
    evidence: list[EvidenceItem] = Field(default_factory=list, max_length=12)
    risks: list[RiskItem] = Field(default_factory=list, max_length=12)
    next_actions: list[ActionDraft] = Field(default_factory=list, max_length=8)
    data_gaps: list[str] = Field(default_factory=list, max_length=12)
    approval_boundary: Literal[APPROVAL_BOUNDARY] = APPROVAL_BOUNDARY


class InsightBriefResponse(BaseModel):
    status: Literal["ready"] = "ready"
    template_id: str
    sources_reviewed: list[str]
    brief: InsightBrief


class ActionProposalRequest(BaseModel):
    template_id: str = Field(min_length=3, max_length=80)
    requested_outcome: str = Field(min_length=3, max_length=800)
    target_surface: Literal["browser", "desktop", "mobile"]
    target_description: str = Field(min_length=3, max_length=500)
    approved_domains: list[str] = Field(default_factory=list, max_length=10)


class ActionProposal(BaseModel):
    status: Literal["ready"] = "ready"
    execution_state: Literal["not_started"] = "not_started"
    target_surface: Literal["browser", "desktop", "mobile"]
    requested_outcome: str
    proposal_steps: list[str]
    required_approvals: list[str]
    approved_domains: list[str]
    approval_boundary: str = APPROVAL_BOUNDARY
