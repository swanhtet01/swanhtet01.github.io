export type AgentTeamDetail = {
  id: string
  name: string
  strap: string
  purpose: string
  delegates: string[]
  handoff: string
  products: string[]
}

export type SoftwareModuleDetail = {
  id: string
  name: string
  category: 'Workflow' | 'Knowledge' | 'Automation' | 'Intelligence'
  status: 'Live wedge' | 'Rollout module' | 'Control layer'
  audience: string
  summary: string
  promise: string
  replaces: string
  surfaces: string[]
  knowledgeModules: string[]
  infrastructureModules: string[]
  agentTeams: string[]
}

export const AGENT_TEAM_DETAILS: AgentTeamDetail[] = [
  {
    id: 'revenue-scout',
    name: 'Revenue Scout',
    strap: 'Reruns saved hunts, ranks new companies, and keeps the pipeline from going stale.',
    purpose: 'Delegates market search refresh, shortlist updates, and early lead prioritization to an always-on worker instead of a manual weekly sweep.',
    delegates: ['saved search reruns', 'candidate scoring', 'shortlist refresh'],
    handoff: 'Hands the operator a shorter list with fit reasons, contact clues, and the next company worth chasing.',
    products: ['Distributor Sales Desk', 'Sales System'],
  },
  {
    id: 'list-clerk',
    name: 'List Clerk',
    strap: 'Cleans imported rows, merges duplicates, and keeps account records usable.',
    purpose: 'Delegates the spreadsheet-cleanup layer that usually blocks outreach, handover, and CRM trust.',
    delegates: ['dedupe', 'field normalization', 'contact cleanup'],
    handoff: 'Hands the team a cleaner list with the rows ready for action and the rows that still need review.',
    products: ['Distributor Sales Desk', 'List Cleanup Desk', 'Sales System'],
  },
  {
    id: 'task-triage',
    name: 'Task Triage',
    strap: 'Turns messy updates, issue notes, and inbound requests into owned next steps.',
    purpose: 'Delegates first-pass queue shaping so humans work from clear tasks instead of raw updates and message fragments.',
    delegates: ['intake parsing', 'owner suggestions', 'next-step drafting'],
    handoff: 'Hands operators a shorter task queue with status, owner, urgency, and suggested next action already attached.',
    products: ['List Cleanup Desk', 'Receiving Control', 'Operations Inbox', 'Support and Service Desk'],
  },
  {
    id: 'approval-watch',
    name: 'Approval Watch',
    strap: 'Collects missing evidence, checks policy gates, and escalates delayed sign-off.',
    purpose: 'Delegates approval preparation and drift detection so approval chains stay controlled without constant manual chasing.',
    delegates: ['approval prep', 'evidence chase', 'delayed sign-off escalation'],
    handoff: 'Hands managers a decision-ready record with policy context, missing items, and the blocked owner highlighted.',
    products: ['Approval Policy Engine', 'Decision Journal', 'Client Portal', 'Supplier Portal'],
  },
  {
    id: 'ops-watch',
    name: 'Ops Watch',
    strap: 'Monitors holds, shortages, stale exceptions, and operational drift across live queues.',
    purpose: 'Delegates exception monitoring so operations teams see the few blockers that need intervention now.',
    delegates: ['stale exception detection', 'queue monitoring', 'risk escalation'],
    handoff: 'Hands supervisors a ranked exception list with the cause, age, owner, and required intervention.',
    products: ['Receiving Control', 'Operations Inbox', 'Supplier Portal', 'Commerce Back Office'],
  },
  {
    id: 'founder-brief',
    name: 'Founder Brief',
    strap: 'Compiles the daily review from live leads, tasks, approvals, and exceptions.',
    purpose: 'Delegates executive summary work so leaders open one brief built from real operating state instead of requesting manual status recaps.',
    delegates: ['daily summary generation', 'risk ranking', 'cross-queue rollup'],
    handoff: 'Hands founders and directors the few changes, delays, and risks that justify attention today.',
    products: ['Distributor Sales Desk', 'List Cleanup Desk', 'Receiving Control', 'Founder Brief', 'Director Command Center'],
  },
]

export const SOFTWARE_MODULE_DETAILS: SoftwareModuleDetail[] = [
  {
    id: 'sales-system',
    name: 'Sales System',
    category: 'Workflow',
    status: 'Rollout module',
    audience: 'Commercial teams, coordinators, founders, and owner-led distribution businesses',
    summary: 'Prospecting, account cleanup, follow-up, quoting, and handoff in one commercial operating layer.',
    promise: 'Replace CRM sprawl and spreadsheet prospecting with one sales system connected to company memory and delegated agent work.',
    replaces: 'CRM sprawl, sales spreadsheets, manual lead tracking, disconnected inbox follow-up',
    surfaces: ['Account desk', 'Follow-up queue', 'Quote handoff', 'Territory review'],
    knowledgeModules: ['Company Memory', 'Decision Journal'],
    infrastructureModules: ['Connector Hub', 'Workflow Runtime', 'Agent Runtime'],
    agentTeams: ['Revenue Scout', 'List Clerk', 'Founder Brief'],
  },
  {
    id: 'operations-inbox',
    name: 'Operations Inbox',
    category: 'Workflow',
    status: 'Rollout module',
    audience: 'Operations leads, warehouse teams, admins, service operators, and branch teams',
    summary: 'Requests, exceptions, documents, approvals, and blockers in one owned queue.',
    promise: 'Replace chat-driven ops and scattered trackers with one live control desk for operational work.',
    replaces: 'ticketing fragments, paper logs, chat-driven operations, shared inbox triage',
    surfaces: ['Issue intake', 'Exception queue', 'Owner board', 'Escalation lane'],
    knowledgeModules: ['Company Memory', 'Document Intelligence'],
    infrastructureModules: ['Workflow Runtime', 'Agent Runtime', 'Observability'],
    agentTeams: ['Task Triage', 'Ops Watch', 'Approval Watch'],
  },
  {
    id: 'client-portal',
    name: 'Client Portal',
    category: 'Workflow',
    status: 'Rollout module',
    audience: 'Agencies, service firms, managed operators, account managers, and external clients',
    summary: 'Status, requests, approvals, files, onboarding, and delivery communication in one branded workspace.',
    promise: 'Replace email chains and separate portal tools with a client-facing system attached to the same company memory.',
    replaces: 'client email chains, scattered shared drives, standalone portal tools',
    surfaces: ['Client workspace', 'Request lane', 'Approval view', 'Shared file room'],
    knowledgeModules: ['Company Memory', 'Knowledge Hub', 'Decision Journal'],
    infrastructureModules: ['Identity and Governance', 'Workflow Runtime', 'Connector Hub'],
    agentTeams: ['Approval Watch', 'Founder Brief'],
  },
  {
    id: 'supplier-portal',
    name: 'Supplier Portal',
    category: 'Workflow',
    status: 'Rollout module',
    audience: 'Procurement teams, receiving leads, warehouses, and external suppliers',
    summary: 'Documents, discrepancies, holds, approvals, and supplier follow-up in one external workspace.',
    promise: 'Replace supplier email loops and document chasing with one controlled vendor-facing system.',
    replaces: 'supplier email loops, document chasing, receiving issue chats',
    surfaces: ['Vendor workspace', 'Discrepancy lane', 'Document requests', 'Hold resolution'],
    knowledgeModules: ['Document Intelligence', 'Decision Journal'],
    infrastructureModules: ['Workflow Runtime', 'Identity and Governance', 'Observability'],
    agentTeams: ['Ops Watch', 'Approval Watch'],
  },
  {
    id: 'support-service-desk',
    name: 'Support and Service Desk',
    category: 'Workflow',
    status: 'Rollout module',
    audience: 'Support leads, service ops, customer success teams, and account teams',
    summary: 'Case ownership, SLA drift, approvals, and knowledge-guided service delivery in one support surface.',
    promise: 'Replace helpdesk sprawl with one support desk that reads the same client context, SOPs, and service history.',
    replaces: 'helpdesk sprawl, manual escalation chains, disconnected support notes',
    surfaces: ['Case inbox', 'SLA board', 'Resolution notes', 'Escalation queue'],
    knowledgeModules: ['Knowledge Hub', 'Company Memory', 'Decision Journal'],
    infrastructureModules: ['Workflow Runtime', 'Agent Runtime', 'Observability'],
    agentTeams: ['Task Triage', 'Approval Watch', 'Founder Brief'],
  },
  {
    id: 'commerce-back-office',
    name: 'Commerce Back Office',
    category: 'Workflow',
    status: 'Rollout module',
    audience: 'Commerce operators, finance, branch leads, storefront managers, and directors',
    summary: 'Orders, settlements, branch issues, stock pressure, and exception follow-up in one control layer.',
    promise: 'Replace commerce ops spreadsheets and disconnected back-office suites with one operational base.',
    replaces: 'commerce ops spreadsheets, branch status chasing, separate back-office suites',
    surfaces: ['Branch board', 'Settlement review', 'Stock pressure view', 'Issue queue'],
    knowledgeModules: ['Company Memory', 'Decision Journal'],
    infrastructureModules: ['Connector Hub', 'Workflow Runtime', 'Observability'],
    agentTeams: ['Ops Watch', 'Founder Brief'],
  },
  {
    id: 'decision-journal',
    name: 'Decision Journal',
    category: 'Knowledge',
    status: 'Control layer',
    audience: 'Managers, founders, finance, procurement, and operations teams',
    summary: 'A searchable record of approvals, exceptions, policy calls, and directional decisions.',
    promise: 'Replace buried email decisions and approval screenshots with a durable reasoning layer connected to work.',
    replaces: 'approval screenshots, buried email decisions, untracked policy calls',
    surfaces: ['Decision log', 'Evidence record', 'Approver trail', 'Outcome history'],
    knowledgeModules: ['Company Memory'],
    infrastructureModules: ['Workflow Runtime', 'Identity and Governance'],
    agentTeams: ['Approval Watch', 'Founder Brief'],
  },
  {
    id: 'document-intelligence',
    name: 'Document Intelligence',
    category: 'Knowledge',
    status: 'Control layer',
    audience: 'Procurement, finance, warehouse teams, admins, and service operators',
    summary: 'Turns inbound files into structured fields, owned work, and routed operational records.',
    promise: 'Replace manual file sorting and dead attachments with a document layer that opens the next workflow automatically.',
    replaces: 'manual file sorting, document inboxes with no workflow, folder-only processing',
    surfaces: ['Ingest lane', 'Extraction view', 'Routing queue', 'Document status'],
    knowledgeModules: ['Company Memory', 'Knowledge Hub'],
    infrastructureModules: ['Connector Hub', 'Workflow Runtime', 'Agent Runtime'],
    agentTeams: ['Task Triage', 'Approval Watch'],
  },
  {
    id: 'approval-policy-engine',
    name: 'Approval Policy Engine',
    category: 'Automation',
    status: 'Control layer',
    audience: 'Managers, procurement, finance, founders, and service leads',
    summary: 'Thresholds, evidence requirements, approver chains, fallback rules, and delay escalation in one policy layer.',
    promise: 'Replace ad hoc approval behavior with a controlled engine that still fits real operational workflows.',
    replaces: 'approval emails, chat approvals, manual routing rules',
    surfaces: ['Policy rules', 'Approval chain', 'Evidence gates', 'Delay alerts'],
    knowledgeModules: ['Decision Journal', 'Company Memory'],
    infrastructureModules: ['Workflow Runtime', 'Identity and Governance', 'Observability'],
    agentTeams: ['Approval Watch', 'Task Triage'],
  },
  {
    id: 'founder-brief',
    name: 'Founder Brief',
    category: 'Intelligence',
    status: 'Control layer',
    audience: 'Founders, GMs, directors, and owner-operators',
    summary: 'A daily operating brief built from live queues, approvals, revenue movement, and exceptions.',
    promise: 'Replace manual status recaps and stale dashboards with one short review surface built from real operating state.',
    replaces: 'manual status recaps, stale dashboards, ad hoc update chasing',
    surfaces: ['Daily brief', 'Risk lane', 'Revenue lane', 'Executive notes'],
    knowledgeModules: ['Company Memory', 'Decision Journal'],
    infrastructureModules: ['Agent Runtime', 'Observability', 'Workflow Runtime'],
    agentTeams: ['Founder Brief', 'Ops Watch'],
  },
  {
    id: 'director-command-center',
    name: 'Director Command Center',
    category: 'Intelligence',
    status: 'Control layer',
    audience: 'Holding company leaders, directors, regional operators, and group founders',
    summary: 'A multi-tenant leadership surface for cross-company review, escalation, and intervention.',
    promise: 'Replace manual rollups with one next-gen control plane for several sites, teams, or portfolio entities.',
    replaces: 'cross-company reporting packs, manual rollups, fragmented leadership review',
    surfaces: ['Portfolio review', 'Tenant health', 'Escalation radar', 'Cross-site exceptions'],
    knowledgeModules: ['Company Memory', 'Decision Journal', 'Knowledge Hub'],
    infrastructureModules: ['Identity and Governance', 'Observability', 'Agent Runtime'],
    agentTeams: ['Founder Brief', 'Ops Watch', 'Approval Watch'],
  },
]

export function getAgentTeamDetail(nameOrId: string | null | undefined) {
  const normalized = String(nameOrId || '')
    .trim()
    .toLowerCase()
  return AGENT_TEAM_DETAILS.find((item) => item.id === normalized || item.name.toLowerCase() === normalized) ?? null
}

export function getAgentTeamDetails(names: string[]) {
  return names
    .map((name) => getAgentTeamDetail(name))
    .filter((item): item is AgentTeamDetail => Boolean(item))
}

export function getSoftwareModuleDetail(productIdOrSlug: string | null | undefined) {
  const normalized = String(productIdOrSlug || '')
    .trim()
    .toLowerCase()
  return SOFTWARE_MODULE_DETAILS.find((item) => item.id === normalized || item.name.toLowerCase() === normalized) ?? null
}
