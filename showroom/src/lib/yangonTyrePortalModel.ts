export type YangonTyrePortalApp = {
  id: string
  name: string
  workspace: string
  route: string
  users: string[]
  mission: string
  dataSources: string[]
  outcome: string
}

export type YangonTyreConnectorChannel = {
  id: string
  name: string
  source: string
  cadence: string
  purpose: string
  outputs: string[]
}

export type YangonTyreManufacturingLoop = {
  id: string
  stage: string
  focus: string
  operators: string[]
  decisions: string[]
  dataSignals: string[]
}

export type YangonTyreAgentCell = {
  id: string
  name: string
  workspace: string
  mission: string
  reads: string[]
  writes: string[]
  guardrail: string
}

export type YangonTyreIdentityLane = {
  id: string
  role: string
  home: string
  route: string
  mandate: string
}

export const YANGON_TYRE_PORTAL_APPS: YangonTyrePortalApp[] = [
  {
    id: 'director-command',
    name: 'CEO Command Center',
    workspace: 'Executive',
    route: '/app/director',
    users: ['CEO', 'Admin'],
    mission: 'Review company risk, plant health, revenue movement, supplier exposure, and agent posture in one daily brief.',
    dataSources: ['briefs', 'approvals', 'connector risk', 'inventory pressure', 'commercial movement'],
    outcome: 'Leadership sees the whole company without waiting for manual updates.',
  },
  {
    id: 'sales-dealer',
    name: 'Sales and Dealer Control',
    workspace: 'Commercial',
    route: '/app/revenue',
    users: ['Sales lead', 'CEO', 'Finance'],
    mission: 'Run account memory, visit plans, quote follow-up, collections pressure, and dealer relationship history.',
    dataSources: ['Gmail', 'Calendar', 'quote trackers', 'account reviews'],
    outcome: 'Commercial follow-up stops living inside scattered inboxes and chat groups.',
  },
  {
    id: 'operations-control',
    name: 'Plant Operations Control',
    workspace: 'Plant',
    route: '/app/operations',
    users: ['Plant manager', 'Receiving', 'Procurement'],
    mission: 'Control inbound issues, daily blockers, shift review, approvals, and action ownership from one queue.',
    dataSources: ['receiving rows', 'shift notes', 'approvals', 'inventory watch'],
    outcome: 'Plant execution stays visible by owner, due date, and next move.',
  },
  {
    id: 'manufacturing-command',
    name: 'Manufacturing Command',
    workspace: 'Factory',
    route: '/app/operations',
    users: ['Plant manager', 'Quality', 'Maintenance'],
    mission: 'Track mixing, extrusion, calendering, building, curing, and final inspection against one digital operating model.',
    dataSources: ['line logs', 'batch genealogy', 'downtime sheets', 'parameter checks'],
    outcome: 'The factory gets one operating surface from raw-material receipt through finished-tyre release.',
  },
  {
    id: 'quality-dqms',
    name: 'DQMS and Quality Lab',
    workspace: 'Quality',
    route: '/app/dqms',
    users: ['Quality manager', 'Plant manager', 'Maintenance'],
    mission: 'Handle incidents, CAPA, containment, fishbone, 5W1H, lab SPC, and defect trends on the same case record.',
    dataSources: ['inspection forms', 'lab sheets', 'batch history', 'quality email'],
    outcome: 'Quality management moves from reactive reporting to structured closeout discipline.',
  },
  {
    id: 'maintenance-reliability',
    name: 'Maintenance and Reliability',
    workspace: 'Reliability',
    route: '/app/maintenance',
    users: ['Maintenance lead', 'Plant manager', 'Quality'],
    mission: 'Control breakdowns, preventive plans, spare-part blockers, repeat-failure studies, and downtime follow-up.',
    dataSources: ['maintenance logs', 'downtime history', 'spare-part watch', 'machine notes'],
    outcome: 'Repeat failures can be ranked, explained, and closed with evidence.',
  },
  {
    id: 'supplier-control',
    name: 'Supplier and Approval Control',
    workspace: 'Procurement',
    route: '/app/approvals',
    users: ['Procurement', 'Finance', 'Plant manager'],
    mission: 'Chase missing documents, resolve discrepancies, track supplier recovery, and control approval thresholds.',
    dataSources: ['supplier Gmail', 'Drive folders', 'PO and invoice exports', 'receiving exceptions'],
    outcome: 'Supplier performance and evidence trails stay attached to the real operating record.',
  },
  {
    id: 'admin-control',
    name: 'Admin and Connector Control',
    workspace: 'Tenant admin',
    route: '/app/platform-admin',
    users: ['Admin'],
    mission: 'Manage roles, connector scopes, domains, policy rules, rollout phases, and the AI workforce itself.',
    dataSources: ['tenant setup', 'connector posture', 'security rules', 'agent run history'],
    outcome: 'The portal scales without losing control over access, data, or automation.',
  },
]

export const YANGON_TYRE_CONNECTOR_CHANNELS: YangonTyreConnectorChannel[] = [
  {
    id: 'gdrive',
    name: 'Google Drive and Shared Folders',
    source: 'Plant folders, QC evidence, maintenance sheets, SOP vault, finance docs',
    cadence: 'Hourly sync until event-based sync is wired',
    purpose: 'Turn live files into structured records, evidence links, and document-backed memory.',
    outputs: ['document index', 'sheet snapshots', 'knowledge candidates'],
  },
  {
    id: 'gmail',
    name: 'Gmail and Attachment Intake',
    source: 'Dealer threads, supplier chases, QC escalation, finance mail',
    cadence: '15-minute sync target',
    purpose: 'Convert inbox noise into account updates, supplier tasks, incident signals, and approval records.',
    outputs: ['thread timeline', 'draft replies', 'task suggestions'],
  },
  {
    id: 'website',
    name: 'Website and Product Inquiry Feed',
    source: 'Public site forms, catalog pages, inquiry capture, and product discovery surfaces',
    cadence: 'Near-real-time webhook or hourly sync target',
    purpose: 'Route dealer and customer interest into account memory, inquiry queues, and product demand signals.',
    outputs: ['web lead capture', 'product inquiry timeline', 'catalog demand summary'],
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics and Funnel Telemetry',
    source: 'Traffic, source attribution, campaign movement, and on-site engagement signals',
    cadence: 'Hourly or daily sync target',
    purpose: 'Turn traffic and campaign movement into explainable commercial and management signals.',
    outputs: ['lead-source scoring', 'campaign attribution', 'traffic anomaly watch'],
  },
  {
    id: 'facebook',
    name: 'Facebook and Social Commercial Inbox',
    source: 'Page messages, post response, social inquiries, and campaign engagement',
    cadence: 'Near-real-time sync target',
    purpose: 'Pull social demand and customer response into the same follow-up discipline as email and site inquiries.',
    outputs: ['social inquiry routing', 'campaign response summary', 'dealer engagement prompt'],
  },
  {
    id: 'chat-mesh',
    name: 'Viber, LINE, WeChat, and Chat Threads',
    source: 'Operator updates, supplier follow-up, dealer chats, management escalation groups',
    cadence: 'Near-real-time ingest target',
    purpose: 'Promote fragmented chat work into owner-based records instead of letting context die in message threads.',
    outputs: ['chat-linked tasks', 'decision evidence', 'follow-up prompts'],
  },
  {
    id: 'erp-exports',
    name: 'ERP, CSV, and Snapshot Feeds',
    source: 'PO, GRN, stock, invoice, batch, branch, and production extracts',
    cadence: 'Intraday or daily batch',
    purpose: 'Keep the portal aligned with quantities, values, traceability, and movement data already used by the business.',
    outputs: ['variance watch', 'inventory signals', 'batch genealogy'],
  },
  {
    id: 'calendar',
    name: 'Calendar, Meetings, and Visit Plans',
    source: 'Sales meetings, supplier reviews, plant review sessions, management cadence',
    cadence: '15-minute sync target',
    purpose: 'Tie meetings and site visits back to actions, decisions, and next review points.',
    outputs: ['agenda notes', 'visit follow-up', 'review reminders'],
  },
  {
    id: 'shopfloor',
    name: 'Shopfloor Logs, Lab Sheets, and Mobile Forms',
    source: 'Mixing, extrusion, calender, building, curing, inspection, downtime, operator capture',
    cadence: 'Shift or live-entry sync',
    purpose: 'Create one digital record of what really happened on the line, not just what reached the report.',
    outputs: ['process drift alerts', 'OEE signals', 'incident starters'],
  },
]

export const YANGON_TYRE_MANUFACTURING_LOOPS: YangonTyreManufacturingLoop[] = [
  {
    id: 'incoming-material',
    stage: 'Incoming material and supplier assurance',
    focus: 'COA checks, GRN discipline, quantity variance, hold and release decisions, supplier recovery.',
    operators: ['Receiving', 'Procurement', 'Quality'],
    decisions: ['release or hold', 'supplier escalation', 'financial approval'],
    dataSignals: ['GRN mismatch', 'document gap', 'COA evidence', 'supplier response age'],
  },
  {
    id: 'compound-genealogy',
    stage: 'Compound and batch genealogy',
    focus: 'Mixing history, compound release, recipe discipline, lab approval, and traceability into downstream use.',
    operators: ['Plant manager', 'Quality', 'Lab'],
    decisions: ['compound release', 'batch containment', 'recipe deviation review'],
    dataSignals: ['batch ID', 'lab result', 'mixing deviation', 'compound aging'],
  },
  {
    id: 'component-process',
    stage: 'Component process control',
    focus: 'Extrusion, calender, bead, apex, tread, and fabric readiness against spec and shift plan.',
    operators: ['Production', 'Quality', 'Maintenance'],
    decisions: ['line adjustment', 'spec escalation', 'maintenance intervention'],
    dataSignals: ['profile drift', 'thickness variance', 'changeover loss', 'downtime reason'],
  },
  {
    id: 'build-cure',
    stage: 'Building, curing, and release',
    focus: 'Building discipline, mold and cure recipe control, undercure risk, visual defects, and final inspection.',
    operators: ['Building team', 'Curing team', 'Quality'],
    decisions: ['contain batch', 'release finished tyres', 'root-cause escalation'],
    dataSignals: ['B+R rate', 'defect pareto', 'cure cycle exception', 'machine repeat failure'],
  },
  {
    id: 'management-loop',
    stage: 'Management review and continuous improvement',
    focus: 'OEE, scrap, cost of quality, CAPA closeout, warranty or field feedback, and next-best intervention.',
    operators: ['CEO', 'Plant manager', 'Quality', 'Maintenance'],
    decisions: ['priority reset', 'cross-team countermeasure', 'capital or policy decision'],
    dataSignals: ['weekly KPI gap', 'open CAPA age', 'repeat defect cluster', 'forecast risk'],
  },
]

export const YANGON_TYRE_AGENT_CELLS: YangonTyreAgentCell[] = [
  {
    id: 'intake-router',
    name: 'Intake Router',
    workspace: 'ytf/inbox-router',
    mission: 'Read mail, files, chat, and forms, then route the signal into the right app, owner, and queue.',
    reads: ['Gmail', 'Drive', 'chat mesh', 'manual forms'],
    writes: ['draft tasks', 'classification tags', 'owner suggestions'],
    guardrail: 'No external messages or status changes without human review.',
  },
  {
    id: 'quality-watch',
    name: 'Quality Watch',
    workspace: 'ytf/quality',
    mission: 'Turn defect evidence, lab results, and recurring failures into incident and CAPA starters.',
    reads: ['quality mail', 'inspection forms', 'lab sheets', 'batch genealogy'],
    writes: ['incident drafts', 'CAPA suggestions', 'closeout reminders'],
    guardrail: 'Quality manager approves any classification that changes supplier, customer, or batch status.',
  },
  {
    id: 'factory-genealogy',
    name: 'Manufacturing Genealogy',
    workspace: 'ytf/factory',
    mission: 'Connect material, compound, machine, batch, and finished-tyre history so root-cause work is evidence-backed.',
    reads: ['ERP extracts', 'shopfloor logs', 'quality records', 'maintenance history'],
    writes: ['traceability packs', 'repeat-failure flags', 'drift alerts'],
    guardrail: 'Genealogy output is advisory until an operator or manager accepts it into the record.',
  },
  {
    id: 'supplier-recovery',
    name: 'Supplier Recovery',
    workspace: 'ytf/procurement',
    mission: 'Rank unresolved document gaps, delayed responses, and inbound discrepancies before they stall plant flow.',
    reads: ['supplier threads', 'Drive evidence', 'approval history', 'receiving exceptions'],
    writes: ['draft reminders', 'escalation proposals', 'supplier digests'],
    guardrail: 'Financial commitments and scorecard changes stay behind procurement or finance approval.',
  },
  {
    id: 'executive-brief',
    name: 'Executive Brief',
    workspace: 'ytf/director',
    mission: 'Generate short daily and weekly briefs from plant, quality, supplier, sales, and runtime state.',
    reads: ['action board', 'approvals', 'inventory risk', 'commercial pipeline', 'connector posture'],
    writes: ['brief drafts', 'risk ranking', 'decision prompts'],
    guardrail: 'External or board-facing summaries require CEO or admin review.',
  },
]

export const YANGON_TYRE_IDENTITY_LANES: YangonTyreIdentityLane[] = [
  {
    id: 'ceo',
    role: 'CEO',
    home: 'CEO Command Center',
    route: '/app/director',
    mandate: 'Review risk, approvals, revenue movement, and the next interventions.',
  },
  {
    id: 'ops',
    role: 'Plant manager',
    home: 'Operations Control',
    route: '/app/operations',
    mandate: 'Run shift issues, cross-team blockers, and plant execution from one queue.',
  },
  {
    id: 'quality',
    role: 'Quality manager',
    home: 'DQMS and Quality Lab',
    route: '/app/dqms',
    mandate: 'Drive incident control, CAPA, lab review, and structured closeout.',
  },
  {
    id: 'maintenance',
    role: 'Maintenance lead',
    home: 'Maintenance and Reliability',
    route: '/app/maintenance',
    mandate: 'Track downtime, PM work, spare-part blockers, and repeat-failure analysis.',
  },
  {
    id: 'procurement',
    role: 'Procurement',
    home: 'Supplier and Approval Control',
    route: '/app/approvals',
    mandate: 'Resolve missing evidence, supplier delays, and approval debt.',
  },
  {
    id: 'sales',
    role: 'Sales lead',
    home: 'Sales and Dealer Control',
    route: '/app/revenue',
    mandate: 'Keep accounts, dealer visits, and follow-up visible by owner and next step.',
  },
  {
    id: 'admin',
    role: 'Admin',
    home: 'Admin and Connector Control',
    route: '/app/platform-admin',
    mandate: 'Manage access, sources, rollout phases, and automation boundaries.',
  },
]
