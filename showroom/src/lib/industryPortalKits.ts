export type IndustryPortalKit = {
  id: string
  name: string
  industry: string
  buyer: string
  strap: string
  promise: string
  launchWedge: string
  roles: string[]
  dataPlugs: string[]
  baseModules: string[]
  adaptiveModules: string[]
  moduleBlueprints: PortalModuleBlueprint[]
  aiLoops: string[]
  adaptationSignals: string[]
  evolutionLanes: AdaptivePortalLane[]
  frameworks: string[]
  mobileFocus: string
  desktopFocus: string
  requestPackage: string
}

export type PortalModuleBlueprint = {
  id: string
  name: string
  workspace: 'Capture' | 'Manager' | 'Director' | 'Builder'
  primaryRole: string
  jobToBeDone: string
  inputs: string[]
  outputs: string[]
  agentAssist: string
  launchMode: 'Day 1' | 'Week 2' | 'Adaptive'
}

export type PortalStandardReference = {
  id: string
  name: string
  shortName: string
  domain: string
  productRule: string
  sourceUrl: string
}

export type SharedPortalModule = {
  id: string
  name: string
  plainName: string
  oneLine: string
  whyItMatters: string
  users: string[]
  inputs: string[]
  outputs: string[]
  standards: string[]
  agentLoop: string
  kpi: string
  launchRule: string
}

export type PortalShellModule = {
  id: string
  name: string
  plainName: string
  purpose: string
  visibleTo: string[]
  owner: string
  mustHave: string[]
  standards: string[]
  firstUse: string
}

export const PORTAL_STANDARD_REFERENCES: PortalStandardReference[] = [
  {
    id: 'iso-9001',
    name: 'Quality management system',
    shortName: 'ISO 9001',
    domain: 'Quality, process control, customer satisfaction, continual improvement',
    productRule: 'Every module must define owner, input, process step, output, KPI, exception, and improvement loop.',
    sourceUrl: 'https://www.iso.org/standard/62085.html',
  },
  {
    id: 'iso-27001',
    name: 'Information security management system',
    shortName: 'ISO/IEC 27001',
    domain: 'Access, information security, risk treatment, control evidence',
    productRule: 'Every portal needs role access, source scope, audit trail, and reviewed writeback before client data is changed.',
    sourceUrl: 'https://www.iso.org/standard/27001',
  },
  {
    id: 'iso-55001',
    name: 'Asset management system',
    shortName: 'ISO 55001',
    domain: 'Asset lifecycle, maintenance, performance, risk, cost, value',
    productRule: 'Maintenance and equipment modules must connect work orders, downtime, spares, risk, and value decisions.',
    sourceUrl: 'https://www.iso.org/standard/83054.html',
  },
  {
    id: 'iso-22301',
    name: 'Business continuity management system',
    shortName: 'ISO 22301',
    domain: 'Continuity, disruption response, resilience, recovery',
    productRule: 'Operational portals must identify disruption risk, owner, workaround, escalation, and recovery status.',
    sourceUrl: 'https://www.iso.org/standard/75106.html',
  },
  {
    id: 'nist-csf',
    name: 'Cybersecurity Framework 2.0',
    shortName: 'NIST CSF',
    domain: 'Govern, identify, protect, detect, respond, recover',
    productRule: 'Security-sensitive modules must expose governance, asset scope, protective controls, detection, response, and recovery cues.',
    sourceUrl: 'https://www.nist.gov/cyberframework',
  },
  {
    id: 'nist-ai-rmf',
    name: 'AI Risk Management Framework',
    shortName: 'NIST AI RMF',
    domain: 'AI governance, mapping, measurement, management',
    productRule: 'Agent modules must show purpose, source data, risk, review gate, measured output quality, and human override.',
    sourceUrl: 'https://www.nist.gov/itl/ai-risk-management-framework',
  },
  {
    id: 'isa-95',
    name: 'Enterprise-control system integration',
    shortName: 'ISA-95',
    domain: 'MES/MOM boundaries, equipment, personnel, material, operations, enterprise integration',
    productRule: 'Industrial modules must separate source systems, canonical operating records, work execution, and enterprise reporting.',
    sourceUrl: 'https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa95',
  },
  {
    id: 'iso-22400',
    name: 'Manufacturing operations management KPIs',
    shortName: 'ISO 22400',
    domain: 'OEE, throughput, quality, availability, performance, KPI definitions',
    productRule: 'Factory KPI modules must name the formula, source data, owner, review cadence, and action threshold.',
    sourceUrl: 'https://www.iso.org/standard/56847.html',
  },
  {
    id: 'isa-62443',
    name: 'Industrial automation and control systems security',
    shortName: 'ISA/IEC 62443',
    domain: 'OT security zones, conduits, controls, risk, secure operations',
    productRule: 'OT-sensitive modules must isolate risky actions, log tool access, and require human approval for changes.',
    sourceUrl: 'https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards',
  },
  {
    id: 'iso-45001',
    name: 'Occupational health and safety management',
    shortName: 'ISO 45001',
    domain: 'Worker safety, hazards, incidents, corrective action, safe work',
    productRule: 'Safety modules must capture hazard, risk, owner, control, incident evidence, and verification.',
    sourceUrl: 'https://www.iso.org/iso-45001-occupational-health-and-safety.html',
  },
  {
    id: 'iso-50001',
    name: 'Energy management system',
    shortName: 'ISO 50001',
    domain: 'Energy performance, baselines, abnormal consumption, savings verification',
    productRule: 'Energy modules must convert utility data into baseline, variance, action, owner, and verified saving.',
    sourceUrl: 'https://www.iso.org/iso-50001-energy-management.html',
  },
  {
    id: 'iso-22000',
    name: 'Food safety management system',
    shortName: 'ISO 22000',
    domain: 'Food safety hazards, PRPs, traceability, corrective action, management system',
    productRule: 'Restaurant modules must capture food safety controls, source evidence, exception ownership, and closeout.',
    sourceUrl: 'https://www.iso.org/iso-22000-food-safety-management.html',
  },
  {
    id: 'gs1-epcis',
    name: 'Electronic Product Code Information Services',
    shortName: 'GS1 EPCIS',
    domain: 'Product traceability, event visibility, what/when/where/why records',
    productRule: 'Traceability modules must capture item, lot, location, time, business step, and disposition.',
    sourceUrl: 'https://www.gs1.org/standards/epcis',
  },
  {
    id: 'pci-dss',
    name: 'Payment Card Industry Data Security Standard',
    shortName: 'PCI DSS',
    domain: 'Payment security, cardholder data, access, monitoring, vulnerability management',
    productRule: 'Payment-adjacent modules must keep sensitive payment scope explicit and outside casual operational records.',
    sourceUrl: 'https://www.pcisecuritystandards.org/standards/pci-dss/',
  },
  {
    id: 'myanmar-qr',
    name: 'Local QR payment guardrail',
    shortName: 'Payment guardrail',
    domain: 'Merchant-presented QR payment payloads, provider-issued acceptance, local payment interoperability',
    productRule: 'Payment modules must distinguish provider-issued settlement payloads from draft/demo QR records and keep provider credentials outside the portal.',
    sourceUrl: 'https://myanmarpay.gov.mm/frontend/assets/files/MyanmarQRSpecification.pdf',
  },
  {
    id: 'iso-41001',
    name: 'Facility management system',
    shortName: 'ISO 41001',
    domain: 'Facility service delivery, asset context, service quality, stakeholder needs',
    productRule: 'Asset service modules must connect service request, asset, site, SLA, proof, closeout, and feedback.',
    sourceUrl: 'https://www.iso.org/standard/68021.html',
  },
]

export const SHARED_PORTAL_MODULES: SharedPortalModule[] = [
  {
    id: 'role-home',
    name: 'Role Home',
    plainName: 'My work today',
    oneLine: 'One simple home for each role: what changed, what is blocked, what needs proof, and what to do next.',
    whyItMatters: 'Users should not hunt through a SaaS menu. The portal opens directly on the work that belongs to them.',
    users: ['Operators', 'Managers', 'Directors', 'Admins'],
    inputs: ['Open tasks', 'New source changes', 'Approvals', 'KPI alerts'],
    outputs: ['Today list', 'Priority queue', 'Escalations'],
    standards: ['iso-9001', 'iso-27001'],
    agentLoop: 'Prepare a short daily work summary with links to the source records.',
    kpi: 'Time to first action',
    launchRule: 'Every portal launches with role home before adding advanced modules.',
  },
  {
    id: 'work-inbox',
    name: 'Work Inbox',
    plainName: 'Requests and exceptions',
    oneLine: 'A governed queue for issues, requests, blockers, complaints, and follow-up.',
    whyItMatters: 'Most companies lose work in chat, email, and spreadsheets. This module makes every item owned and traceable.',
    users: ['Operators', 'Coordinators', 'Supervisors'],
    inputs: ['Forms', 'Emails', 'Photos', 'Manual entries', 'Connector events'],
    outputs: ['Owned ticket', 'Next action', 'Evidence packet'],
    standards: ['iso-9001', 'iso-22301'],
    agentLoop: 'Classify new items, suggest owner, urgency, missing evidence, and next action.',
    kpi: 'Exception aging',
    launchRule: 'Use this as the first module when the client is drowning in messages or manual trackers.',
  },
  {
    id: 'client-room',
    name: 'Client Room',
    plainName: 'Client room',
    oneLine: 'One shared room for people, source requests, decisions, tasks, approvals, and handoff.',
    whyItMatters: 'Custom software fails when scope, files, approvals, and handoff live in separate chats. This module keeps the buyer and builder aligned.',
    users: ['Owners', 'Managers', 'Delivery leads', 'Admins'],
    inputs: ['Source requests', 'Role list', 'Decision notes', 'Scope approvals', 'Release evidence'],
    outputs: ['Handoff summary', 'Decision log', 'Source request queue', 'Go-live checklist'],
    standards: ['iso-9001', 'iso-27001', 'nist-ai-rmf'],
    agentLoop: 'Prepare handoff summaries, identify missing source evidence, and queue review items without changing client records.',
    kpi: 'Days from source sample to approved first workspace',
    launchRule: 'Every paid portal gets a client room before private data connections or billing activation.',
  },
  {
    id: 'document-control',
    name: 'Document Control',
    plainName: 'Files with source truth',
    oneLine: 'Connect Drive, email attachments, spreadsheets, PDFs, and uploads into one source ledger.',
    whyItMatters: 'AI outputs are only useful when users can see where the answer came from and what changed.',
    users: ['Admins', 'Managers', 'Knowledge owners'],
    inputs: ['Drive folders', 'Gmail attachments', 'Docs', 'Sheets', 'PDFs'],
    outputs: ['Source ledger', 'Changed-file queue', 'Record provenance'],
    standards: ['iso-9001', 'iso-27001', 'nist-csf'],
    agentLoop: 'Detect changed files, classify them, extract entities, and ask humans to confirm ambiguous records.',
    kpi: 'Unreviewed source changes',
    launchRule: 'Use this before analytics or knowledge graph work.',
  },
  {
    id: 'approval-decision-log',
    name: 'Approval and Decision Log',
    plainName: 'Who approved what',
    oneLine: 'A clear place for decisions, approvals, evidence, exceptions, and audit history.',
    whyItMatters: 'Enterprise software becomes useful when decisions are explicit and later reviewable.',
    users: ['Managers', 'Directors', 'Quality leads', 'Admins'],
    inputs: ['Evidence packets', 'Policy checks', 'Exception queues'],
    outputs: ['Decision record', 'Approval status', 'Audit trail'],
    standards: ['iso-9001', 'iso-27001', 'nist-csf'],
    agentLoop: 'Prepare decision packets and flag missing evidence before approval.',
    kpi: 'Approval cycle time',
    launchRule: 'Required before any agent or workflow can write back to business records.',
  },
  {
    id: 'kpi-review',
    name: 'KPI Review',
    plainName: 'Metrics that explain action',
    oneLine: 'Turn operating data into KPI movement, gap analysis, owner action, and management review.',
    whyItMatters: 'Dashboards fail when they do not create action. This module ties metrics to owners and decisions.',
    users: ['Managers', 'Directors', 'CEO'],
    inputs: ['Work queues', 'Daily entries', 'ERP exports', 'Quality logs'],
    outputs: ['KPI story', 'Gap analysis', 'Corrective action'],
    standards: ['iso-9001', 'iso-22301'],
    agentLoop: 'Explain KPI movement, identify likely causes, and suggest the next management review question.',
    kpi: 'Actionable KPI rate',
    launchRule: 'Add after the first queue has enough activity to measure.',
  },
  {
    id: 'agent-workbench',
    name: 'Prepared Work Review',
    plainName: 'Prepared checks',
    oneLine: 'Prepare summaries, cleanup, analysis, drafts, and follow-up with human review gates.',
    whyItMatters: 'Agents should not be magic buttons. They need purpose, scoped data, evidence, and approval.',
    users: ['Operators', 'Managers', 'Admins'],
    inputs: ['Approved tools', 'Source records', 'Tasks', 'Policies'],
    outputs: ['Draft output', 'Evidence links', 'Review request'],
    standards: ['nist-ai-rmf', 'iso-27001'],
    agentLoop: 'Run bounded jobs, record inputs and outputs, and route risky actions for approval.',
    kpi: 'Reviewable agent output rate',
    launchRule: 'Add only after access and approval policy are clear.',
  },
  {
    id: 'data-quality',
    name: 'Data Quality',
    plainName: 'Document Extraction Ledger',
    oneLine: 'Find duplicates, missing fields, stale records, inconsistent naming, and broken ownership.',
    whyItMatters: 'Custom portals become valuable when the system improves messy company data instead of copying it.',
    users: ['Admins', 'Analysts', 'Managers'],
    inputs: ['CSV', 'Sheets', 'ERP exports', 'CRM records', 'Document entities'],
    outputs: ['Cleanup queue', 'Quality score', 'Owner correction request'],
    standards: ['iso-9001', 'nist-ai-rmf'],
    agentLoop: 'Suggest merges, normalize fields, detect anomalies, and keep a human-confirmed correction trail.',
    kpi: 'Trusted record rate',
    launchRule: 'Use this whenever the client has spreadsheets, file folders, or CRM exports.',
  },
]

export const PORTAL_SHELL_MODULES: PortalShellModule[] = [
  {
    id: 'login-access',
    name: 'Login and Access',
    plainName: 'Secure login',
    purpose: 'Workspace login, roles, permissions, session state, and clear proof-account boundaries.',
    visibleTo: ['All users'],
    owner: 'Tenant admin',
    mustHave: ['Role-based access', 'Password reset path', 'Proof workspace label', 'Session expiry', 'Workspace switch'],
    standards: ['iso-27001', 'nist-csf'],
    firstUse: 'A manager can log in and immediately land on their role home without choosing from a confusing menu.',
  },
  {
    id: 'workspace-shell',
    name: 'Workspace Shell',
    plainName: 'The app frame',
    purpose: 'A calmer app frame that separates the logged-in portal from the public website.',
    visibleTo: ['All users'],
    owner: 'Product admin',
    mustHave: ['Simple navigation', 'Current role', 'Current site/company', 'Search', 'Help panel'],
    standards: ['iso-9001'],
    firstUse: 'The user knows where they are, what role they are using, and what module is open.',
  },
  {
    id: 'module-launcher',
    name: 'Module Launcher',
    plainName: 'Apps in the portal',
    purpose: 'One place to open the enabled modules for a role, with disabled modules hidden unless the admin is configuring them.',
    visibleTo: ['All users', 'Admins'],
    owner: 'Tenant admin',
    mustHave: ['Enabled modules', 'Pilot modules', 'Role visibility', 'First recommended action'],
    standards: ['iso-9001', 'iso-27001'],
    firstUse: 'A sales user sees CRM and customer follow-up, not maintenance or platform-admin tools.',
  },
  {
    id: 'connector-hub',
    name: 'Connector Hub',
    plainName: 'Data sources',
    purpose: 'Connect Drive, Gmail, Sheets, uploads, ERP exports, POS, CMMS, and other source systems with ownership and sync state.',
    visibleTo: ['Admins', 'Implementation team'],
    owner: 'Data owner',
    mustHave: ['Source owner', 'Sync status', 'Last change', 'Access scope', 'Review queue'],
    standards: ['iso-27001', 'nist-csf', 'nist-ai-rmf'],
    firstUse: 'The admin can see which sources are live, stale, broken, or waiting for permission.',
  },
  {
    id: 'evidence-ledger',
    name: 'Evidence Ledger',
    plainName: 'Proof trail',
    purpose: 'Keep the source links, files, photos, notes, approvals, and agent outputs behind every business decision.',
    visibleTo: ['Managers', 'Directors', 'Admins'],
    owner: 'Process owner',
    mustHave: ['Source link', 'Decision owner', 'Timestamp', 'Change history', 'Human approval'],
    standards: ['iso-9001', 'iso-27001', 'nist-ai-rmf'],
    firstUse: 'A manager can open a KPI or CAPA claim and see the source records behind it.',
  },
  {
    id: 'agent-control-plane',
    name: 'Automation Control',
    plainName: 'Reviewed automation',
    purpose: 'Assign, review, approve, and audit prepared work without giving any automation uncontrolled write access.',
    visibleTo: ['Managers', 'Admins', 'AI operators'],
    owner: 'Platform admin',
    mustHave: ['Agent roster', 'Allowed tools', 'Run history', 'Review gate', 'Rollback note'],
    standards: ['nist-ai-rmf', 'iso-27001', 'nist-csf'],
    firstUse: 'An agent can prepare a brief or cleanup proposal, but the human approves the final action.',
  },
  {
    id: 'meta-tools',
    name: 'Meta Tools',
    plainName: 'Build and adapt',
    purpose: 'Configure roles, modules, data schemas, rollout packs, standards, and client-specific portal changes.',
    visibleTo: ['Platform admins', 'Tenant admins'],
    owner: 'Implementation lead',
    mustHave: ['Role map', 'Module status', 'Schema editor', 'Rollout checklist', 'Gap analysis'],
    standards: ['iso-9001', 'nist-ai-rmf'],
    firstUse: 'The implementation team can adapt a client portal without exposing builder controls to normal users.',
  },
  {
    id: 'notification-command',
    name: 'Notification Command',
    plainName: 'Alerts that matter',
    purpose: 'Send fewer, better alerts: only blockers, approvals, source failures, safety risks, and stale work.',
    visibleTo: ['All users'],
    owner: 'Process owner',
    mustHave: ['Owner', 'Severity', 'Due time', 'Escalation path', 'Mute rule'],
    standards: ['iso-9001', 'iso-22301'],
    firstUse: 'The user gets a short list of consequential work instead of a noisy dashboard.',
  },
]

export type AdaptivePortalEngineStep = {
  id: string
  name: string
  detail: string
}

export type AdaptivePortalLane = {
  id: string
  signal: string
  promotedModule: string
  owner: string
  desktopDecision: string
  mobileCapture: string
}

export type PortalWorkspaceType = {
  id: string
  name: string
  purpose: string
  primaryUsers: string[]
  desktopFocus: string
  mobileFocus: string
  modules: string[]
  outcome: string
}

export const PORTAL_KERNEL_MODULES = [
  'Login and access',
  'Workspace shell',
  'Module launcher',
  'Role home',
  'Action queue',
  'Connector hub',
  'Evidence ledger',
  'Document intelligence',
  'Approval engine',
  'Agent runtime',
  'Meta tools',
  'KPI story pack',
] as const

export const PORTAL_WORKSPACE_TYPES: PortalWorkspaceType[] = [
  {
    id: 'capture-desk',
    name: 'Capture desk',
    purpose: 'Frontline entry for issues, notes, photos, counts, and first evidence.',
    primaryUsers: ['Operators', 'Store leads', 'Technicians'],
    desktopFocus: 'Confirm the queue, the owner, and the next action without opening a second tool.',
    mobileFocus: 'Fast capture for photos, shift notes, signatures, counts, and abnormality evidence.',
    modules: ['Shift Command', 'Operations Inbox', 'Client Portal'],
    outcome: 'New work reaches one governed queue fast.',
  },
  {
    id: 'manager-desk',
    name: 'Manager desk',
    purpose: 'Daily review, approval, escalation, and coaching for one function or site.',
    primaryUsers: ['Managers', 'Supervisors', 'Department leads'],
    desktopFocus: 'Review KPI drift, approvals, blockers, and repeated issues across the team.',
    mobileFocus: 'Approve, escalate, or request missing evidence without losing the thread.',
    modules: ['Manager System', 'Industrial DQMS', 'Supplier Portal'],
    outcome: 'Managers work from one review loop instead of chat, spreadsheets, and memory.',
  },
  {
    id: 'director-desk',
    name: 'Director desk',
    purpose: 'Cross-function review for revenue, risk, operations, and portfolio health.',
    primaryUsers: ['Founders', 'Directors', 'Regional leaders'],
    desktopFocus: 'Open one short brief with tenant health, KPI stories, and intervention points.',
    mobileFocus: 'Read the daily brief, approve exceptions, and intervene on the few risks that matter.',
    modules: ['Founder Brief', 'Director Command Center', 'Data Science Studio'],
    outcome: 'Leadership sees the few changes that justify attention today.',
  },
  {
    id: 'builder-desk',
    name: 'Builder desk',
    purpose: 'Connector mapping, role setup, module rollout, and runtime supervision for client delivery.',
    primaryUsers: ['Implementation team', 'Tenant admins', 'Product owners'],
    desktopFocus: 'Map data plugs, launch domains, assign roles, and review rollout gaps.',
    mobileFocus: 'Check rollout health, queued jobs, and urgent launch blockers while away from the desk.',
    modules: ['Tenant Control Plane', 'Agent Runtime', 'Knowledge Graph'],
    outcome: 'The same platform core can be rebuilt for the next client quickly and safely.',
  },
]

export const INDUSTRY_PORTAL_KITS: IndustryPortalKit[] = [
  {
    id: 'industrial-plant-os',
    name: 'Factory Operations App',
    industry: 'Manufacturing, distribution, and industrial operations',
    buyer: 'CEO, plant manager, quality lead, operations manager',
    strap: 'The flagship portal: production, quality, maintenance, receiving, safety, energy, and leadership on one plant control layer.',
    promise: 'Start with the real operating loop: what is planned, what happened, what broke, what is unsafe, what quality evidence exists, who owns the action, and what changed since yesterday.',
    launchWedge: 'Launch Operations Command, Quality Traceability, Asset Reliability, Supplier/Receiving Control, and Executive Brief first.',
    roles: ['CEO', 'Plant manager', 'Operations manager', 'Quality lead', 'Maintenance lead', 'Safety lead', 'Admin'],
    dataPlugs: ['Google Drive', 'Gmail', 'ERP exports', 'MES/PLC exports', 'QC sheets', 'CMMS logs', 'Utility meters', 'Supplier invoices'],
    baseModules: [
      'Operations Command',
      'Quality Traceability and CAPA',
      'Asset Reliability',
      'Supplier and Receiving Control',
      'Executive Decision Brief',
      'OT Safety and Risk',
    ],
    adaptiveModules: ['Defect genealogy', 'Downtime risk predictor', 'Energy variance coach', 'Supplier quality scorecard', 'SOP training coach'],
    moduleBlueprints: [
      {
        id: 'industrial-operations-command',
        name: 'Operations Command',
        workspace: 'Manager',
        primaryRole: 'Plant manager',
        jobToBeDone: 'Control production plan, output, downtime, manpower, blocked work, and handover in one daily operating board.',
        inputs: ['Production plan', 'ERP/MES output', 'Downtime notes', 'Shift entries', 'Manpower notes'],
        outputs: ['OEE story', 'Schedule risk', 'Blocker owners', 'Shift handover'],
        agentAssist: 'Explains throughput and OEE movement, clusters blockers, and drafts the next shift handover with evidence links.',
        launchMode: 'Day 1',
      },
      {
        id: 'industrial-quality-traceability-capa',
        name: 'Quality Traceability and CAPA',
        workspace: 'Manager',
        primaryRole: 'Quality lead',
        jobToBeDone: 'Turn defects, complaints, holds, and inspection drift into NCR, containment, fishbone, 5W1H, CAPA, and verification work.',
        inputs: ['QC sheets', 'Inspection records', 'Complaint emails', 'Lot data', 'Photos'],
        outputs: ['NCR/CAPA packet', 'Affected-lot trace', 'Containment checklist', 'Verification evidence'],
        agentAssist: 'Links defect evidence by lot, product, machine, shift, and supplier, then drafts root-cause branches for human approval.',
        launchMode: 'Day 1',
      },
      {
        id: 'industrial-asset-reliability',
        name: 'Asset Reliability',
        workspace: 'Manager',
        primaryRole: 'Maintenance lead',
        jobToBeDone: 'Reduce unplanned downtime by connecting breakdowns, PM compliance, spares, readings, work orders, and repeat faults.',
        inputs: ['Breakdown logs', 'PM sheets', 'Spares usage', 'Technician notes', 'Machine readings'],
        outputs: ['MTBF/MTTR brief', 'PM risk list', 'Repeat fault cluster', 'Spare action queue'],
        agentAssist: 'Finds repeat failure modes, drafts 5 Why notes, and recommends the next PM or spare action before escalation.',
        launchMode: 'Day 1',
      },
      {
        id: 'industrial-supplier-receiving-control',
        name: 'Supplier and Receiving Control',
        workspace: 'Manager',
        primaryRole: 'Operations manager',
        jobToBeDone: 'Control inbound materials, shortages, COA mismatches, damaged goods, supplier claims, and production-impacting holds.',
        inputs: ['Purchase orders', 'Supplier invoices', 'Receiving photos', 'COA documents', 'QC holds'],
        outputs: ['Receiving exception', 'Supplier claim packet', 'Production risk alert', 'Recovery follow-up'],
        agentAssist: 'Builds discrepancy packets, finds repeat supplier patterns, and drafts supplier follow-up with attached evidence.',
        launchMode: 'Day 1',
      },
      {
        id: 'industrial-executive-decision-brief',
        name: 'Executive Decision Brief',
        workspace: 'Director',
        primaryRole: 'CEO',
        jobToBeDone: 'Open one daily view of production risk, quality exposure, downtime, supplier blockers, cash-sensitive decisions, and approvals.',
        inputs: ['Operations Command', 'Quality Traceability', 'Asset Reliability', 'Supplier holds', 'Sales/customer risk'],
        outputs: ['Daily decision brief', 'Top risks', 'Approval queue', 'Gap analysis'],
        agentAssist: 'Drafts the brief, explains KPI movement, names the owner of each risk, and links every claim to source evidence.',
        launchMode: 'Day 1',
      },
      {
        id: 'industrial-energy-utility-watch',
        name: 'Energy and Utility Watch',
        workspace: 'Manager',
        primaryRole: 'Utilities or finance lead',
        jobToBeDone: 'Catch abnormal energy, compressed air, water, steam, and peak-demand movement before cost and reliability drift.',
        inputs: ['Utility bills', 'Meter readings', 'Production output', 'Shift schedule'],
        outputs: ['kWh per unit story', 'Abnormal consumption alert', 'Savings verification queue'],
        agentAssist: 'Compares energy baselines against output and suggests actions with owner and verification date.',
        launchMode: 'Week 2',
      },
      {
        id: 'industrial-ot-safety-risk',
        name: 'OT Safety and Risk',
        workspace: 'Capture',
        primaryRole: 'Safety lead',
        jobToBeDone: 'Capture hazards, near misses, permit issues, OT/security exceptions, and risky operational changes in one controlled queue.',
        inputs: ['Safety observations', 'Near-miss entries', 'Permit notes', 'OT change requests', 'Security alerts'],
        outputs: ['Risk queue', 'Control verification', 'Incident evidence', 'Change approval packet'],
        agentAssist: 'Classifies hazard and OT risk, checks missing controls, and routes risky changes for approval before action.',
        launchMode: 'Week 2',
      },
      {
        id: 'industrial-factory-knowledge-graph',
        name: 'Factory Knowledge Graph',
        workspace: 'Builder',
        primaryRole: 'Admin',
        jobToBeDone: 'Convert folders, sheets, emails, SOPs, asset records, batches, and decisions into searchable company memory.',
        inputs: ['Drive folders', 'Gmail threads', 'Docs', 'Sheets', 'SOPs', 'Asset lists'],
        outputs: ['Entity map', 'Source ledger', 'KPI-ready records', 'Changed-file review queue'],
        agentAssist: 'Extracts entities, links records, detects changed files, and proposes cleaner data-entry templates for humans to approve.',
        launchMode: 'Adaptive',
      },
    ],
    aiLoops: ['OEE variance explanation', 'CAPA packet drafting', 'Maintenance repeat-fault clustering', 'Supplier claim assembly', 'Energy anomaly review'],
    adaptationSignals: ['OEE drift', 'defect recurrence', 'downtime spikes', 'supplier hold clusters', 'abnormal energy per unit', 'unowned source changes'],
    evolutionLanes: [
      {
        id: 'industrial-defect-genealogy',
        signal: 'Defects repeat by SKU, compound, machine, shift, or supplier.',
        promotedModule: 'Defect genealogy and lot trace',
        owner: 'Quality lead',
        desktopDecision: 'Group defects, confirm containment, approve CAPA, and lock verification evidence.',
        mobileCapture: 'Operators capture defect photo, lot, machine, shift, and immediate containment from the floor.',
      },
      {
        id: 'industrial-maintenance-risk',
        signal: 'Downtime and repeat fault notes cluster around the same machine or spares lane.',
        promotedModule: 'Downtime risk predictor',
        owner: 'Maintenance lead',
        desktopDecision: 'Decide PM priority, spare action, and escalation before the next breakdown window.',
        mobileCapture: 'Technicians log readings, photos, parts used, and closeout notes at the machine.',
      },
      {
        id: 'industrial-supplier-quality',
        signal: 'Supplier holds, receiving gaps, and QC failures repeat across purchase orders.',
        promotedModule: 'Supplier quality scorecard',
        owner: 'Operations manager',
        desktopDecision: 'Approve supplier action, request evidence, or escalate commercial recovery.',
        mobileCapture: 'Receiving captures shortage, damage, COA mismatch, and hold evidence at intake.',
      },
      {
        id: 'industrial-energy-variance',
        signal: 'Energy per unit moves outside the baseline after shifts, machines, or product mix change.',
        promotedModule: 'Energy variance coach',
        owner: 'Utilities or finance lead',
        desktopDecision: 'Approve an action, verify savings, or investigate equipment/process causes.',
        mobileCapture: 'Operators capture meter readings, abnormal utility notes, and equipment conditions.',
      },
    ],
    frameworks: ['OpenAI Agents SDK', 'Temporal', 'Postgres + pgvector', 'OpenTelemetry', 'Airbyte', 'DuckDB'],
    mobileFocus: 'Fast floor capture for defects, breakdowns, hazards, receiving issues, meter readings, photos, and approvals.',
    desktopFocus: 'Plant review for OEE, CAPA, reliability, supplier recovery, safety risk, energy variance, and CEO decisions.',
    requestPackage: 'Factory Operations App',
  },
  {
    id: 'restaurant-group-os',
    name: 'Restaurant POS + Inventory Desk',
    industry: 'Restaurant, retail, and service counters',
    buyer: 'Owner operator, area manager, store manager',
    strap: 'QR menu, provider payment proof, cash-up close, shift notes, stock, and owner review in one calmer store desk.',
    promise: 'Start with one store or counter, then turn menus, payment evidence, POS, supplier evidence, stock notes, and manager notes into one operating system.',
    launchWedge: 'Launch QR menu, payment proof, cash-up close, shift board, stock/prep control, and owner report first.',
    roles: ['Store manager', 'Cashier lead', 'Kitchen lead', 'Purchasing', 'Area manager', 'Owner operator'],
    dataPlugs: ['POS', 'payment provider exports', 'cash-up sheets', 'Delivery apps', 'Supplier invoices', 'Staff schedule', 'Prep logs'],
    baseModules: ['QR menu', 'Payment proof and cash-up control', 'Shift board', 'Stock and prep control', 'Owner report', 'Supplier discrepancy desk'],
    adaptiveModules: ['Waste watch', 'Recipe variance monitor', 'Promo lift brief', 'Cash-up reconciliation'],
    moduleBlueprints: [
      {
        id: 'restaurant-shift-board',
        name: 'Shift Board',
        workspace: 'Capture',
        primaryRole: 'Store manager',
        jobToBeDone: 'Run opening, rush, close, staffing notes, and service blockers from one shift page.',
        inputs: ['Staff schedule', 'POS daypart data', 'Manager notes'],
        outputs: ['Shift handover', 'Blocker list', 'Manager action queue'],
        agentAssist: 'Summarizes shift notes and flags repeated service blockers.',
        launchMode: 'Day 1',
      },
      {
        id: 'restaurant-stock-prep',
        name: 'Stock and Prep Control',
        workspace: 'Manager',
        primaryRole: 'Kitchen lead',
        jobToBeDone: 'Control prep counts, stock-outs, waste, supplier gaps, and substitutions before service quality drops.',
        inputs: ['Supplier invoices', 'Prep counts', 'Waste photos', 'POS mix'],
        outputs: ['Reorder draft', 'Waste review', 'Prep variance list'],
        agentAssist: 'Drafts reorder suggestions and explains prep variance by branch or item.',
        launchMode: 'Day 1',
      },
      {
        id: 'restaurant-guest-recovery',
        name: 'Guest Recovery Desk',
        workspace: 'Manager',
        primaryRole: 'Area manager',
        jobToBeDone: 'Group guest issues, delivery complaints, refunds, and recovery actions into one service-quality record.',
        inputs: ['Delivery apps', 'Reviews', 'Refund logs', 'Manager notes'],
        outputs: ['Recovery queue', 'Complaint clusters', 'Training cues'],
        agentAssist: 'Clusters repeat issues and drafts recovery actions for manager approval.',
        launchMode: 'Week 2',
      },
      {
        id: 'restaurant-pos-payment',
        name: 'Payment Proof and Cash-Up Control',
        workspace: 'Capture',
        primaryRole: 'Cashier lead',
        jobToBeDone: 'Capture provider payment proof, track paid/pending/reconcile status, and close cash-up exceptions.',
        inputs: ['Provider QR/payment link/slip', 'Order reference', 'Payment amount', 'Cash-up export', 'Settlement screenshot'],
        outputs: ['Payment proof packet', 'Cash-up exception list', 'Owner review queue'],
        agentAssist: 'Matches payment exports to order refs and drafts cash-up exception notes without storing sensitive credentials.',
        launchMode: 'Day 1',
      },
      {
        id: 'restaurant-supplier-discrepancy',
        name: 'Supplier Discrepancy Desk',
        workspace: 'Capture',
        primaryRole: 'Purchasing',
        jobToBeDone: 'Capture wrong items, late deliveries, short quantity, price mismatch, and supplier follow-up.',
        inputs: ['Invoices', 'Receiving photos', 'Purchase orders'],
        outputs: ['Supplier claim', 'Hold queue', 'Credit follow-up'],
        agentAssist: 'Prepares discrepancy packets with photos, invoice lines, and follow-up text.',
        launchMode: 'Day 1',
      },
      {
        id: 'restaurant-promo-lift',
        name: 'Promo Lift Brief',
        workspace: 'Director',
        primaryRole: 'Owner operator',
        jobToBeDone: 'See which campaigns are actually moving sales, margin, labor, and stock pressure.',
        inputs: ['POS', 'Promo calendar', 'Inventory', 'Delivery app data'],
        outputs: ['Promo decision brief', 'Extend/stop recommendation', 'Branch comparison'],
        agentAssist: 'Explains promo lift and flags campaigns creating waste or service strain.',
        launchMode: 'Adaptive',
      },
    ],
    aiLoops: ['Daily shift summary', 'Payment reconciliation', 'Reorder draft', 'Guest pattern clustering'],
    adaptationSignals: ['unreconciled payment value', 'void spikes', 'waste drift', 'delivery complaint clusters', 'repeat stock-outs'],
    evolutionLanes: [
      {
        id: 'restaurant-waste-watch',
        signal: 'Waste drift stays above the target range for consecutive shifts.',
        promotedModule: 'Waste watch',
        owner: 'Area manager',
        desktopDecision: 'Review branch variance, assign supplier or prep fixes, and lock the next review window.',
        mobileCapture: 'Shift lead logs spoilage, photo proof, and prep notes from the floor.',
      },
      {
        id: 'restaurant-recipe-variance',
        signal: 'Recipe cost and prep timing start moving apart across locations.',
        promotedModule: 'Recipe variance monitor',
        owner: 'Kitchen lead',
        desktopDecision: 'Compare branches, confirm the root cause, and approve the corrected prep standard.',
        mobileCapture: 'Kitchen teams capture yield counts, prep delays, and substitutions during service.',
      },
      {
        id: 'restaurant-promo-lift',
        signal: 'Campaign performance changes faster than the team can read manually.',
        promotedModule: 'Promo lift brief',
        owner: 'Ops lead',
        desktopDecision: 'Decide whether to extend, correct, or stop the promotion.',
        mobileCapture: 'Store managers confirm display setup, stock position, and competitor notes.',
      },
      {
        id: 'restaurant-pos-reconciliation',
        signal: 'Unreconciled digital payments remain open at cash-up close.',
        promotedModule: 'Payment proof and cash-up control',
        owner: 'Owner operator',
        desktopDecision: 'Approve settlement evidence, mismatch notes, and provider follow-up.',
        mobileCapture: 'Cashier captures order ref, amount, payment status, and settlement screenshot from the counter.',
      },
    ],
    frameworks: ['Temporal', 'Airbyte', 'OpenTelemetry', 'Expo', 'Provider payment export reconciliation'],
    mobileFocus: 'Phone-first entry for shift leads, cashiers, counts, photos, and guest recovery.',
    desktopFocus: 'Area review for payments, labor, margin, supplier issues, and multi-branch drift.',
    requestPackage: 'Restaurant POS + Inventory Desk',
  },
  {
    id: 'service-business-os',
    name: 'Service Desk POS',
    industry: 'Spa, clinic, repair, salon, and service-retail operators',
    buyer: 'Service business owner, front desk lead, cashier lead, branch manager',
    strap: 'Bookings, checkout, customer notes, payment proof, expenses, staff follow-up, and daily close in one counter desk.',
    promise: 'Start with the real front-desk loop: who came in, what service was sold, what was paid, what proof exists, what follow-up is needed, and what the owner must review today.',
    launchWedge: 'Launch Appointments, Checkout, Customer Notes, Expense Log, and Daily Close first.',
    roles: ['Owner', 'Front desk', 'Cashier', 'Service lead', 'Manager', 'Admin'],
    dataPlugs: ['booking sheet', 'service menu', 'payment proof', 'expense receipts', 'customer notes', 'staff notes'],
    baseModules: ['Appointments', 'Checkout', 'Customer Notes', 'Expense Log', 'Daily Close'],
    adaptiveModules: ['Repeat guest recovery', 'No-show risk', 'Cash variance', 'Service capacity'],
    moduleBlueprints: [
      {
        id: 'service-client-crm',
        name: 'Customer Notes',
        workspace: 'Manager',
        primaryRole: 'Front desk',
        jobToBeDone: 'See every active customer, visit note, service preference, follow-up promise, and owner-sensitive issue in one view.',
        inputs: ['customer notes', 'booking form', 'service history', 'front-desk message'],
        outputs: ['customer brief', 'follow-up queue', 'missing note'],
        agentAssist: 'Summarizes visit history, classifies the next follow-up, and flags missing proof before the day closes.',
        launchMode: 'Day 1',
      },
      {
        id: 'service-delivery-queue',
        name: 'Service Queue',
        workspace: 'Manager',
        primaryRole: 'Service lead',
        jobToBeDone: 'Convert appointments, walk-ins, service status, product needs, and staff follow-up into one queue with owner and proof.',
        inputs: ['booking list', 'walk-in notes', 'service notes', 'staff messages'],
        outputs: ['service queue', 'blocked work list', 'completion proof packet'],
        agentAssist: 'Groups scattered front-desk work into customer-facing status, owner, and next action.',
        launchMode: 'Day 1',
      },
      {
        id: 'service-meeting-action-tracker',
        name: 'Appointment Follow-Up',
        workspace: 'Capture',
        primaryRole: 'Front desk',
        jobToBeDone: 'Turn bookings, missed visits, complaints, and customer notes into owners, deadlines, and follow-up drafts.',
        inputs: ['Calendar events', 'booking notes', 'customer messages', 'complaint notes'],
        outputs: ['follow-up list', 'customer action list', 'message draft'],
        agentAssist: 'Extracts next actions, then drafts a short customer follow-up for approval.',
        launchMode: 'Day 1',
      },
      {
        id: 'service-proposal-builder',
        name: 'Package and Quote Builder',
        workspace: 'Director',
        primaryRole: 'Founder',
        jobToBeDone: 'Turn service menu, customer needs, pricing assumptions, and risk notes into a package or quote review packet.',
        inputs: ['service menu', 'customer request', 'pricing notes', 'discount policy'],
        outputs: ['quote outline', 'margin risk', 'approval packet'],
        agentAssist: 'Drafts the package structure, flags missing pricing evidence, and prepares the owner review.',
        launchMode: 'Week 2',
      },
      {
        id: 'service-billing-readiness',
        name: 'Daily Close',
        workspace: 'Director',
        primaryRole: 'Cashier',
        jobToBeDone: 'Show which payments, services, expenses, and customer follow-ups are ready to close or missing proof.',
        inputs: ['checkout queue', 'payment proof', 'expense receipts', 'service notes'],
        outputs: ['daily close list', 'missing proof queue', 'owner variance alert'],
        agentAssist: 'Prepares the closeout packet and names the missing evidence before owner review.',
        launchMode: 'Week 2',
      },
    ],
    aiLoops: ['Booking triage', 'Payment proof review', 'Customer follow-up drafting', 'Daily close packet prep'],
    adaptationSignals: ['stale customer follow-up', 'cash variance patterns', 'unclosed appointments', 'repeat service complaints'],
    evolutionLanes: [
      {
        id: 'service-churn-risk',
        signal: 'A customer has stale follow-ups, unresolved complaints, and declining repeat visits.',
        promotedModule: 'Repeat guest recovery',
        owner: 'Founder',
        desktopDecision: 'Decide recovery action, owner, and customer communication path.',
        mobileCapture: 'Front desk logs a short customer temperature note after a visit.',
      },
      {
        id: 'service-scope-creep',
        signal: 'Discounts, free add-ons, or service rework repeatedly lack owner approval.',
        promotedModule: 'Margin and variance monitor',
        owner: 'Manager',
        desktopDecision: 'Approve discount rule, rework policy, or cashier training.',
        mobileCapture: 'Cashier tags exception reasons during checkout.',
      },
      {
        id: 'service-client-knowledge-base',
        signal: 'The same customer questions, service instructions, and aftercare notes are repeatedly searched or asked.',
        promotedModule: 'Service knowledge base',
        owner: 'Support lead',
        desktopDecision: 'Promote approved answers and service instructions into reusable counter knowledge.',
        mobileCapture: 'Service lead marks a resolved answer as reusable after review.',
      },
    ],
    frameworks: ['OpenAI Agents SDK', 'Vercel AI SDK', 'Stripe', 'Google Workspace APIs', 'OpenTelemetry'],
    mobileFocus: 'Fast capture for appointments, checkout, customer notes, payment proof, expenses, and follow-up commitments.',
    desktopFocus: 'Owner review for bookings, revenue, service proof, customer recovery, expenses, and daily close.',
    requestPackage: 'Service Desk POS',
  },
]

export const ADAPTIVE_PORTAL_ENGINE: AdaptivePortalEngineStep[] = [
  {
    id: 'observe',
    name: 'Observe source changes',
    detail: 'Watch connected systems, human entry, and approval history so module design follows the real work instead of guesses.',
  },
  {
    id: 'canon',
    name: 'Canonize the record',
    detail: 'Normalize files, messages, tasks, and metrics into one shared operating record with provenance and owner context.',
  },
  {
    id: 'score',
    name: 'Score the friction',
    detail: 'Measure repeat issues, cycle time, approval drag, and missing evidence to decide which module deserves promotion next.',
  },
  {
    id: 'promote',
    name: 'Promote a tighter module',
    detail: 'Turn the repeated pain into one role-ready desk with mobile capture, desktop review, and bounded agent loops.',
  },
]

const SOFTWARE_MODULE_PORTAL_KIT_IDS: Record<string, string[]> = {
  'sales-system': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'operations-inbox': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'industrial-dqms': ['industrial-plant-os'],
  'manager-operating-system': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'shift-command': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'client-portal': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'supplier-portal': ['industrial-plant-os', 'restaurant-group-os'],
  'support-service-desk': ['restaurant-group-os', 'service-business-os'],
  'commerce-back-office': ['restaurant-group-os', 'service-business-os'],
  'decision-journal': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'knowledge-hub': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'document-intelligence': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'approval-policy-engine': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'founder-brief': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'director-command-center': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'knowledge-graph': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'agent-runtime': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'tenant-control-plane': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'data-science-studio': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
}

const SOFTWARE_MODULE_WORKSPACE_TYPE_IDS: Record<string, string[]> = {
  'sales-system': ['capture-desk', 'manager-desk', 'director-desk'],
  'operations-inbox': ['capture-desk', 'manager-desk', 'builder-desk'],
  'industrial-dqms': ['manager-desk', 'director-desk', 'builder-desk'],
  'manager-operating-system': ['manager-desk', 'director-desk'],
  'shift-command': ['capture-desk', 'manager-desk'],
  'client-portal': ['capture-desk', 'manager-desk', 'builder-desk'],
  'supplier-portal': ['capture-desk', 'manager-desk'],
  'support-service-desk': ['capture-desk', 'manager-desk', 'director-desk'],
  'commerce-back-office': ['capture-desk', 'manager-desk', 'director-desk'],
  'decision-journal': ['manager-desk', 'director-desk', 'builder-desk'],
  'knowledge-hub': ['manager-desk', 'builder-desk'],
  'document-intelligence': ['capture-desk', 'builder-desk'],
  'approval-policy-engine': ['manager-desk', 'builder-desk', 'director-desk'],
  'founder-brief': ['director-desk', 'manager-desk'],
  'director-command-center': ['director-desk', 'builder-desk'],
  'knowledge-graph': ['builder-desk', 'manager-desk'],
  'agent-runtime': ['builder-desk', 'manager-desk', 'director-desk'],
  'tenant-control-plane': ['builder-desk', 'manager-desk'],
  'data-science-studio': ['director-desk', 'manager-desk', 'builder-desk'],
}

const STARTER_PACK_PORTAL_KIT_IDS: Record<string, string[]> = {
  'industrial-dqms': ['industrial-plant-os'],
  'spa-service-desk': ['service-business-os'],
  'sales-setup': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'company-cleanup': ['industrial-plant-os', 'restaurant-group-os', 'service-business-os'],
  'receiving-control': ['industrial-plant-os', 'restaurant-group-os'],
  'service-delivery-control': ['service-business-os'],
}

const STARTER_PACK_WORKSPACE_TYPE_IDS: Record<string, string[]> = {
  'spa-service-desk': ['capture-desk', 'manager-desk'],
  'sales-setup': ['capture-desk', 'manager-desk', 'director-desk'],
  'company-cleanup': ['capture-desk', 'manager-desk'],
  'receiving-control': ['capture-desk', 'manager-desk', 'builder-desk'],
}

function normalizeLookup(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

const PORTAL_KIT_ALIASES: Record<string, string> = {
  'industrial-os': 'industrial-plant-os',
  'restaurant-retail-os': 'restaurant-group-os',
  'restaurant-os': 'restaurant-group-os',
  'retail-chain-os': 'industrial-plant-os',
  'retail chain os': 'industrial-plant-os',
  'field-service-os': 'industrial-plant-os',
  'field service os': 'industrial-plant-os',
  'professional-services-os': 'service-business-os',
  'professional services os': 'service-business-os',
  'agency-os': 'service-business-os',
  'agency os': 'service-business-os',
}

export function getIndustryPortalKit(idOrName: string | null | undefined) {
  const normalized = normalizeLookup(idOrName)
  const canonical = PORTAL_KIT_ALIASES[normalized] ?? normalized
  return INDUSTRY_PORTAL_KITS.find((item) => item.id === canonical || item.name.toLowerCase() === canonical) ?? null
}

export function getPortalWorkspaceType(idOrName: string | null | undefined) {
  const normalized = normalizeLookup(idOrName)
  return PORTAL_WORKSPACE_TYPES.find((item) => item.id === normalized || item.name.toLowerCase() === normalized) ?? null
}

function resolveIndustryPortalKits(ids: string[]) {
  return ids
    .map((id) => getIndustryPortalKit(id))
    .filter((item): item is IndustryPortalKit => Boolean(item))
}

function resolvePortalWorkspaceTypes(ids: string[]) {
  return ids
    .map((id) => getPortalWorkspaceType(id))
    .filter((item): item is PortalWorkspaceType => Boolean(item))
}

export function getIndustryPortalKitsForSoftwareModule(idOrName: string | null | undefined) {
  const normalized = normalizeLookup(idOrName)
  return resolveIndustryPortalKits(SOFTWARE_MODULE_PORTAL_KIT_IDS[normalized] ?? INDUSTRY_PORTAL_KITS.map((item) => item.id))
}

export function getPortalWorkspaceTypesForSoftwareModule(idOrName: string | null | undefined) {
  const normalized = normalizeLookup(idOrName)
  return resolvePortalWorkspaceTypes(SOFTWARE_MODULE_WORKSPACE_TYPE_IDS[normalized] ?? PORTAL_WORKSPACE_TYPES.map((item) => item.id))
}

export function getIndustryPortalKitsForStarterPack(idOrName: string | null | undefined) {
  const normalized = normalizeLookup(idOrName)
  return resolveIndustryPortalKits(STARTER_PACK_PORTAL_KIT_IDS[normalized] ?? INDUSTRY_PORTAL_KITS.map((item) => item.id))
}

export function getPortalWorkspaceTypesForStarterPack(idOrName: string | null | undefined) {
  const normalized = normalizeLookup(idOrName)
  return resolvePortalWorkspaceTypes(STARTER_PACK_WORKSPACE_TYPE_IDS[normalized] ?? PORTAL_WORKSPACE_TYPES.map((item) => item.id))
}

export function getPortalStandards(ids: string[]) {
  const requested = new Set(ids)
  return PORTAL_STANDARD_REFERENCES.filter((item) => requested.has(item.id))
}

export function getSharedPortalModule(id: string | null | undefined) {
  const normalized = normalizeLookup(id)
  return SHARED_PORTAL_MODULES.find((item) => item.id === normalized || item.name.toLowerCase() === normalized) ?? null
}

export function getPortalModuleStandardTags(module: PortalModuleBlueprint) {
  const standards = new Set<string>(['iso-9001'])
  const id = module.id.toLowerCase()
  const name = module.name.toLowerCase()
  if (id.includes('industrial') || id.includes('factory') || id.includes('production') || id.includes('operations-command')) {
    standards.add('isa-95')
    standards.add('iso-22400')
  }
  if (module.workspace === 'Builder' || id.includes('knowledge') || id.includes('proof') || id.includes('data') || id.includes('connector')) {
    standards.add('iso-27001')
  }
  if (module.workspace === 'Director' || name.includes('brief') || name.includes('control')) {
    standards.add('nist-ai-rmf')
  }
  if (id.includes('maintenance') || id.includes('reliability') || id.includes('parts') || id.includes('asset')) {
    standards.add('iso-55001')
  }
  if (id.includes('safety') || id.includes('hazard')) {
    standards.add('iso-45001')
  }
  if (id.includes('ot') || id.includes('cyber')) {
    standards.add('isa-62443')
  }
  if (id.includes('energy') || id.includes('utility')) {
    standards.add('iso-50001')
  }
  if (id.includes('food') || id.includes('kitchen') || id.includes('restaurant') || id.includes('allergen')) {
    standards.add('iso-22000')
  }
  if (id.includes('traceability') || id.includes('lot') || id.includes('inventory') || id.includes('supplier')) {
    standards.add('gs1-epcis')
  }
  if (id.includes('payment')) {
    standards.add('pci-dss')
  }
  if (id.includes('facility') || id.includes('service-command') || id.includes('onsite')) {
    standards.add('iso-41001')
  }
  if (id.includes('sla') || id.includes('dispatch') || id.includes('supplier') || id.includes('shift')) {
    standards.add('iso-22301')
  }
  return PORTAL_STANDARD_REFERENCES.filter((item) => standards.has(item.id)).map((item) => item.shortName)
}

export function getPortalModuleValueMetric(module: PortalModuleBlueprint) {
  const id = module.id.toLowerCase()
  if (id.includes('approval') || id.includes('decision')) return 'Approval cycle time'
  if (id.includes('quality') || id.includes('capa') || id.includes('defect')) return 'Repeat defect rate'
  if (id.includes('operations-command')) return 'OEE and schedule adherence'
  if (id.includes('maintenance') || id.includes('reliability') || id.includes('fault') || id.includes('parts') || id.includes('asset')) return 'Downtime and first-time-fix'
  if (id.includes('safety') || id.includes('ot')) return 'Open critical risk'
  if (id.includes('energy') || id.includes('utility')) return 'Energy per unit'
  if (id.includes('sales') || id.includes('crm') || id.includes('customer')) return 'Follow-up aging'
  if (id.includes('stock') || id.includes('replenishment') || id.includes('inventory') || id.includes('demand')) return 'Trusted stock and stock-out risk'
  if (id.includes('food') || id.includes('prep') || id.includes('waste')) return 'Food safety and waste exceptions'
  if (id.includes('sla') || id.includes('dispatch')) return 'SLA breach risk'
  if (id.includes('document') || id.includes('knowledge')) return 'Unreviewed source changes'
  return 'Time to owned action'
}

export function industryPortalRolloutLink(value: string) {
  return `/contact?package=${encodeURIComponent(value)}`
}
