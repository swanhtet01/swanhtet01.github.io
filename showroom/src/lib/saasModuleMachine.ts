export type SaasModuleFamily = {
  id: string
  name: string
  marketPattern: string
  incumbents: string[]
  operatorJobs: string[]
  aiNativeUpgrade: string
  firstSellableModule: string
  agentCrew: string[]
  dataConnectors: string[]
  sellablePackage: string
  route: string
  releaseGate: string
}

export type ModuleFactoryStage = {
  id: string
  name: string
  owner: string
  output: string
  gate: string
}

export type ModuleMachineStackLayer = {
  id: string
  layer: string
  purpose: string
  requiredCapability: string
}

export const SAAS_MODULE_FACTORY_STAGES: ModuleFactoryStage[] = [
  {
    id: 'map',
    name: 'Map the winning workflow',
    owner: 'SaaS Deconstruction Pod',
    output: 'Jobs, records, permissions, states, and current pain points.',
    gate: 'Do not build until the core operator job and source record are clear.',
  },
  {
    id: 'simplify',
    name: 'Compress the user experience',
    owner: 'Experience Systems Pod',
    output: 'One role home, one queue, one entry surface, and one review loop.',
    gate: 'The new flow must reduce tab switching, duplicate entry, or decision delay.',
  },
  {
    id: 'compile',
    name: 'Compile workflow into runtime',
    owner: 'Workflow Compiler Pod',
    output: 'Entity model, state machine, approval graph, event log, and task contracts.',
    gate: 'Every write must have owner, source, audit path, and rollback behavior.',
  },
  {
    id: 'crew',
    name: 'Attach bounded agent crews',
    owner: 'Agent Workforce Pod',
    output: 'Drafting, triage, watch, retrieval, browser, and review playbooks.',
    gate: 'Autonomy expands only after tool scopes, approvals, and evals are defined.',
  },
  {
    id: 'productize',
    name: 'Package as a sellable module',
    owner: 'Product Systems Pod',
    output: 'Offer page, proof path, setup checklist, pricing wedge, and release evidence.',
    gate: 'No module counts as sellable until a live route, role, data source, and smoke check exist.',
  },
]

export const SAAS_MODULE_MACHINE_STACK: ModuleMachineStackLayer[] = [
  {
    id: 'tenant-kernel',
    layer: 'Tenant portal kernel',
    purpose: 'Company profile, role homes, permissions, module registry, and white-label shell.',
    requiredCapability: 'Enterprise auth, route access, tenant config, and role-aware UX.',
  },
  {
    id: 'tool-plane',
    layer: 'Tool and connector plane',
    purpose: 'Connect Gmail, Drive, Sheets, ERP exports, CRMs, calendars, browsers, APIs, and internal data.',
    requiredCapability: 'Scoped connectors, MCP-style tool contracts, retries, secrets, and provenance.',
  },
  {
    id: 'workflow-runtime',
    layer: 'Workflow runtime',
    purpose: 'Durable tasks, approvals, events, reminders, writeback, and human review loops.',
    requiredCapability: 'Queues, event log, state machines, idempotent actions, and audit history.',
  },
  {
    id: 'agent-runtime',
    layer: 'Agent runtime',
    purpose: 'Run planner, researcher, analyst, browser, code, data, and operator-support agents.',
    requiredCapability: 'Model routing, sandboxing, tool scopes, memory boundaries, and escalation policy.',
  },
  {
    id: 'memory-intelligence',
    layer: 'Memory and intelligence layer',
    purpose: 'Turn files, inboxes, records, and usage signals into reusable company context.',
    requiredCapability: 'Vector search, graph records, extraction jobs, evaluations, and data quality scoring.',
  },
  {
    id: 'release-control',
    layer: 'Release and safety control',
    purpose: 'Keep modules deployable, measurable, secure, and continuously improving.',
    requiredCapability: 'Smoke tests, evals, observability, security checks, domain readiness, and rollback.',
  },
]

export const SAAS_MODULE_FAMILIES: SaasModuleFamily[] = [
  {
    id: 'crm',
    name: 'AI CRM and Account Memory',
    marketPattern: 'Salesforce and HubSpot-style account, pipeline, activity, and follow-up control.',
    incumbents: ['Salesforce', 'HubSpot', 'Pipedrive'],
    operatorJobs: ['Account memory', 'pipeline review', 'follow-up drafting', 'quote handoff'],
    aiNativeUpgrade: 'Agents keep account context fresh, summarize buyer history, rank next steps, and draft follow-up with source evidence.',
    firstSellableModule: 'Sales System',
    agentCrew: ['Revenue Scout', 'List Clerk', 'Founder Brief'],
    dataConnectors: ['Gmail', 'Sheets', 'CSV imports', 'website leads', 'calendar'],
    sellablePackage: 'Revenue workspace for owner-led sales teams.',
    route: '/app/revenue',
    releaseGate: 'One live account list, one follow-up queue, one approved outreach workflow, and one weekly revenue brief.',
  },
  {
    id: 'erp',
    name: 'AI ERP Operations Layer',
    marketPattern: 'Odoo, NetSuite, and SAP-style operations, procurement, receiving, and finance coordination.',
    incumbents: ['Odoo', 'NetSuite', 'SAP Business One'],
    operatorJobs: ['Receiving exceptions', 'supplier recovery', 'approval routing', 'inventory visibility'],
    aiNativeUpgrade: 'Agents turn messy operational updates into owned tasks with linked documents and escalation paths.',
    firstSellableModule: 'Operations Inbox',
    agentCrew: ['Task Triage', 'Ops Watch', 'Approval Watch'],
    dataConnectors: ['ERP export', 'Drive', 'Gmail', 'Sheets', 'forms'],
    sellablePackage: 'Operations control portal for factories and distributors.',
    route: '/app/operations',
    releaseGate: 'Live exception queue, receiving evidence, approval status, and director summary must work in one flow.',
  },
  {
    id: 'workspace',
    name: 'AI Workspace Suite',
    marketPattern: 'Google Workspace and Microsoft 365-style documents, inbox, calendar, and team coordination.',
    incumbents: ['Google Workspace', 'Microsoft 365', 'Notion'],
    operatorJobs: ['Document search', 'meeting prep', 'decision capture', 'status updates'],
    aiNativeUpgrade: 'The workspace becomes a company memory engine instead of a file cabinet.',
    firstSellableModule: 'Knowledge Hub',
    agentCrew: ['Memory Curator', 'Founder Brief', 'Task Triage'],
    dataConnectors: ['Drive', 'Docs', 'Sheets', 'Gmail', 'Calendar'],
    sellablePackage: 'Company memory portal for teams with scattered files and inboxes.',
    route: '/app/knowledge',
    releaseGate: 'Search, source links, role-specific knowledge packs, and decision history must be visible.',
  },
  {
    id: 'project',
    name: 'AI Project and Work Management',
    marketPattern: 'Asana, Monday, Jira, and Linear-style tickets, projects, and delivery tracking.',
    incumbents: ['Asana', 'Monday.com', 'Jira', 'Linear'],
    operatorJobs: ['Task triage', 'project status', 'blocked work', 'owner accountability'],
    aiNativeUpgrade: 'Agents convert updates, chats, docs, and meetings into cleaner owned work with evidence.',
    firstSellableModule: 'Action Board',
    agentCrew: ['Task Triage', 'Runtime Orchestrator', 'Founder Brief'],
    dataConnectors: ['Gmail', 'Slack or chat export', 'Drive', 'calendar', 'forms'],
    sellablePackage: 'Work queue and accountability system for teams that run from chats and spreadsheets.',
    route: '/app/action-board',
    releaseGate: 'Every task needs owner, status, source evidence, due date, and next action.',
  },
  {
    id: 'service',
    name: 'AI Service Desk',
    marketPattern: 'Zendesk, Intercom, Freshdesk, and ServiceNow-style request intake and resolution.',
    incumbents: ['Zendesk', 'Intercom', 'Freshdesk', 'ServiceNow'],
    operatorJobs: ['Intake routing', 'customer reply drafting', 'SLA watch', 'knowledge lookup'],
    aiNativeUpgrade: 'Agents classify requests, retrieve policy, draft replies, and escalate only the real exceptions.',
    firstSellableModule: 'Support and Service Desk',
    agentCrew: ['Task Triage', 'Memory Curator', 'Approval Watch'],
    dataConnectors: ['Gmail', 'website forms', 'WhatsApp export', 'knowledge base', 'CRM'],
    sellablePackage: 'Service desk for SMEs that need controlled replies and visible follow-through.',
    route: '/app/service-desk',
    releaseGate: 'Request intake, triage, reply draft, owner, SLA, and source transcript must stay together.',
  },
  {
    id: 'bi',
    name: 'AI BI and Executive Review',
    marketPattern: 'Power BI, Tableau, Looker, and Anaplan-style reporting, planning, and review.',
    incumbents: ['Power BI', 'Tableau', 'Looker', 'Anaplan'],
    operatorJobs: ['KPI review', 'variance explanation', 'forecasting', 'management brief'],
    aiNativeUpgrade: 'Dashboards become action-linked briefs with anomaly reasons and recommended interventions.',
    firstSellableModule: 'Director Command Center',
    agentCrew: ['Forecast Analyst', 'Founder Brief', 'Data Quality Watch'],
    dataConnectors: ['ERP export', 'Sheets', 'SQL', 'CSV', 'portal event log'],
    sellablePackage: 'Owner and director review system for companies drowning in passive dashboards.',
    route: '/app/director',
    releaseGate: 'At least three live KPIs must link to source data, explanation, owner, and next action.',
  },
  {
    id: 'hris',
    name: 'AI HR and Team Operations',
    marketPattern: 'Workday, BambooHR, Rippling, and Deel-style employee records, onboarding, and policy workflows.',
    incumbents: ['Workday', 'BambooHR', 'Rippling', 'Deel'],
    operatorJobs: ['Onboarding', 'policy Q&A', 'role setup', 'performance notes'],
    aiNativeUpgrade: 'Agents prepare onboarding, answer policy questions from source docs, and keep role access aligned.',
    firstSellableModule: 'Team Portal',
    agentCrew: ['Tenant Operator', 'Memory Curator', 'Approval Watch'],
    dataConnectors: ['Drive', 'Docs', 'Sheets', 'calendar', 'identity provider'],
    sellablePackage: 'Employee portal for small enterprises that need guided onboarding and controlled access.',
    route: '/app/onboarding',
    releaseGate: 'Role map, onboarding checklist, policy sources, and approval path must be configured.',
  },
  {
    id: 'finance',
    name: 'AI Finance Operations',
    marketPattern: 'QuickBooks, Xero, Bill, Ramp, and Stripe-style invoices, spend, collections, and approvals.',
    incumbents: ['QuickBooks', 'Xero', 'Bill', 'Ramp', 'Stripe'],
    operatorJobs: ['Invoice chase', 'payment status', 'spend approval', 'cash review'],
    aiNativeUpgrade: 'Agents reconcile documents, flag missing evidence, draft collection follow-up, and prepare owner review.',
    firstSellableModule: 'Finance Control Desk',
    agentCrew: ['Approval Watch', 'Forecast Analyst', 'Task Triage'],
    dataConnectors: ['Accounting export', 'bank CSV', 'Stripe', 'Drive', 'Gmail'],
    sellablePackage: 'Finance follow-up system for businesses where cash control lives in inboxes.',
    route: '/app/approvals',
    releaseGate: 'One finance queue must connect document, amount, owner, policy, and approval state.',
  },
  {
    id: 'marketing',
    name: 'AI Marketing Operations',
    marketPattern: 'Marketo, Mailchimp, HubSpot Marketing, and Hootsuite-style campaigns and content operations.',
    incumbents: ['Marketo', 'Mailchimp', 'HubSpot Marketing', 'Hootsuite'],
    operatorJobs: ['Campaign calendar', 'content drafting', 'lead routing', 'performance review'],
    aiNativeUpgrade: 'Agents turn product proof, customer notes, and campaign signals into reusable outreach and content loops.',
    firstSellableModule: 'Growth Desk',
    agentCrew: ['Revenue Scout', 'Memory Curator', 'Founder Brief'],
    dataConnectors: ['Website analytics', 'Gmail', 'Sheets', 'CRM', 'social exports'],
    sellablePackage: 'Growth operations workspace for founder-led teams.',
    route: '/app/revenue/prospecting',
    releaseGate: 'Campaign brief, target list, content source, approval, and result review must be connected.',
  },
  {
    id: 'commerce',
    name: 'AI Commerce Back Office',
    marketPattern: 'Shopify, WooCommerce, Square, and Lightspeed-style order, inventory, and customer operations.',
    incumbents: ['Shopify', 'WooCommerce', 'Square', 'Lightspeed'],
    operatorJobs: ['Order exception', 'inventory sync', 'refund review', 'customer recovery'],
    aiNativeUpgrade: 'Agents surface order risks, reconcile inventory evidence, and draft customer recovery actions.',
    firstSellableModule: 'Commerce Back Office',
    agentCrew: ['Ops Watch', 'Task Triage', 'Forecast Analyst'],
    dataConnectors: ['Store export', 'inventory sheet', 'Gmail', 'payment provider', 'shipping export'],
    sellablePackage: 'Back-office command portal for commerce teams.',
    route: '/app/restaurant-os',
    releaseGate: 'Order, inventory, payment, owner, and customer response must be visible for exceptions.',
  },
  {
    id: 'qms',
    name: 'AI Quality and Compliance',
    marketPattern: 'ETQ, MasterControl, Intelex, and SafetyCulture-style quality, incidents, and CAPA control.',
    incumbents: ['ETQ', 'MasterControl', 'Intelex', 'SafetyCulture'],
    operatorJobs: ['Incident intake', 'root cause', 'CAPA', 'audit evidence'],
    aiNativeUpgrade: 'Agents prepare root-cause structure, cluster recurring issues, and keep evidence attached to the decision.',
    firstSellableModule: 'Industrial DQMS',
    agentCrew: ['Quality Architect', 'Memory Curator', 'Approval Watch'],
    dataConnectors: ['Forms', 'Drive', 'ERP export', 'lab sheets', 'maintenance logs'],
    sellablePackage: 'Quality operating system for manufacturers and regulated teams.',
    route: '/app/dqms',
    releaseGate: 'Incident, evidence, root-cause draft, approval, and corrective action must be in one record.',
  },
  {
    id: 'itops',
    name: 'AI IT and Security Operations',
    marketPattern: 'ServiceNow, Okta, Jira Service Management, and Datadog-style incidents, identity, and controls.',
    incumbents: ['ServiceNow', 'Okta', 'Jira Service Management', 'Datadog'],
    operatorJobs: ['Access request', 'incident review', 'security exception', 'asset visibility'],
    aiNativeUpgrade: 'Agents triage alerts, prepare safe actions, check policies, and keep approvals explicit.',
    firstSellableModule: 'Runtime and Security Control',
    agentCrew: ['Runtime Orchestrator', 'Approval Watch', 'Tenant Operator'],
    dataConnectors: ['Identity provider', 'logs', 'GitHub', 'Sentry', 'cloud provider'],
    sellablePackage: 'Internal control plane for teams running AI agents and production software.',
    route: '/app/security',
    releaseGate: 'Access, alert, policy, approval, and audit path must be visible before any automated action.',
  },
]

export const MODULE_MACHINE_OPERATING_RULES = [
  'Start from proven SaaS categories, but rebuild around the operator job instead of copying screen clutter.',
  'Every module must plug into tenant memory, role permissions, connectors, workflow runtime, and agent review gates.',
  'Every sellable product needs a live route, setup checklist, smoke check, proof story, and first-week adoption loop.',
  'Autonomous agents should draft, watch, retrieve, rank, and escalate before they receive sensitive write access.',
] as const
