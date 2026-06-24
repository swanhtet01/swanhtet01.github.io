export type AiFoundryCrew = {
  id: string
  name: string
  workspace: string
  mission: string
  inputs: string[]
  outputs: string[]
  gate: string
}

export type SaasRebuildTrack = {
  id: string
  category: string
  incumbents: string[]
  jobs: string[]
  aiNativeAngle: string
  firstProducts: string[]
}

export type AiFoundryStage = {
  id: string
  name: string
  detail: string
  crews: string[]
  artifacts: string[]
}

export type ExperienceLaw = {
  title: string
  detail: string
}

export type FoundryDialectic = {
  id: string
  name: string
  owner: string
  thesis: string
  antithesis: string
  synthesis: string
  provesIn: string[]
}

export type FoundryHackathonTrack = {
  id: string
  name: string
  sprint: string
  unitId: string
  workspaceIds: string[]
  appRoute: string
  proofRoute: string
  thesis: string
  antithesis: string
  synthesis: string
  modules: string[]
  crews: string[]
  shipSignal: string
}

export type FrontierModuleConcept = {
  id: string
  name: string
  category: string
  whyNow: string
  thesis: string
  borrowedFrom: string[]
  platformMove: string
  route: string
}

export type TenantAppModuleRequirement = {
  key: string
  name: string
  match: string[]
}

export type TenantAppCrewRequirement = {
  id: string
  name: string
}

export type TenantAppFoundryBlueprint = {
  id: string
  name: string
  route: string
  workspace: string
  incumbents: string[]
  coreRecord: string
  operatingLoop: string
  thesis: string
  antithesis: string
  synthesis: string
  aiCrew: string
  experienceEdge: string
  releaseGate: string
  moduleRequirements: TenantAppModuleRequirement[]
  crewRequirements: TenantAppCrewRequirement[]
  requiredArtifacts: string[]
  successSignals: string[]
}

export const AI_FOUNDRY_CREWS: AiFoundryCrew[] = [
  {
    id: 'saas-deconstruction',
    name: 'SaaS Deconstruction Pod',
    workspace: 'core-platform/research',
    mission: 'Reverse-engineer successful SaaS products into jobs, states, permissions, and operator pain before we rebuild them as AI-native apps.',
    inputs: ['incumbent workflows', 'customer pain points', 'screenshots and docs', 'tenant rollout notes'],
    outputs: ['job map', 'state model', 'role matrix', 'copy-to-native brief'],
    gate: 'Only promote patterns that map cleanly to real operator jobs and evidence-bearing records.',
  },
  {
    id: 'experience-systems',
    name: 'Experience Systems Pod',
    workspace: 'core-platform/design',
    mission: 'Turn workflow contracts into role homes, entry surfaces, queues, and review loops that feel simpler than the software we are replacing.',
    inputs: ['job maps', 'entry friction notes', 'role goals', 'release gates'],
    outputs: ['route map', 'screen contract', 'form rules', 'interaction patterns'],
    gate: 'Every screen must reduce clicks, switching, or re-entry versus the current process.',
  },
  {
    id: 'workflow-compiler',
    name: 'Workflow Compiler Pod',
    workspace: 'core-platform/factory',
    mission: 'Compose app logic from states, events, approvals, and automation boundaries instead of hand-waving process design.',
    inputs: ['state model', 'entity model', 'approval rules', 'automation goals'],
    outputs: ['workflow contract', 'event map', 'approval graph', 'task lanes'],
    gate: 'No workflow gets promoted without a clear rollback path and one visible source of truth.',
  },
  {
    id: 'data-spine',
    name: 'Data Spine Pod',
    workspace: 'core-platform/data',
    mission: 'Design canonical records, provenance, and cross-app relations so every app runs on the same operational memory.',
    inputs: ['entities', 'documents', 'ERP extracts', 'connector feeds'],
    outputs: ['canonical schema', 'record graph', 'provenance rules', 'sync contracts'],
    gate: 'Every fact must point back to a source record or an approved human entry surface.',
  },
  {
    id: 'agent-workforce',
    name: 'Agent Workforce Pod',
    workspace: 'core-platform/agent-ops',
    mission: 'Define the bounded AI crews that draft, rank, watch, and escalate inside each app.',
    inputs: ['workflow contract', 'tool access', 'review rules', 'latency targets'],
    outputs: ['agent playbooks', 'tool scopes', 'escalation ladders', 'autonomy posture'],
    gate: 'Sensitive writes and cross-functional decisions stay behind human review.',
  },
  {
    id: 'experience-evals',
    name: 'Experience Evals Pod',
    workspace: 'core-platform/evals',
    mission: 'Test every app for entry friction, clarity, speed, and failure recovery before it graduates into daily use.',
    inputs: ['app shell', 'user flows', 'live data samples', 'support complaints'],
    outputs: ['ux defects', 'entry-friction report', 'regression checks', 'release recommendation'],
    gate: 'If staff cannot learn the screen in one guided session, it is not ready.',
  },
]

export const SAAS_REBUILD_TRACKS: SaasRebuildTrack[] = [
  {
    id: 'crm',
    category: 'CRM and account memory',
    incumbents: ['Salesforce', 'HubSpot', 'Pipedrive'],
    jobs: ['pipeline review', 'follow-up ownership', 'visit planning', 'credit-risk visibility'],
    aiNativeAngle: 'Replace static pipelines with action-first account memory, next-step discipline, and agent-drafted follow-up.',
    firstProducts: ['Sales and Dealer Control', 'CEO revenue brief'],
  },
  {
    id: 'procurement',
    category: 'Procurement, approvals, and vendor control',
    incumbents: ['SAP', 'Oracle Procurement', 'NetSuite approvals'],
    jobs: ['document chase', 'supplier recovery', 'approval routing', 'exposure ranking'],
    aiNativeAngle: 'Collapse email chains and approval debt into evidence-linked recovery queues with bounded escalation.',
    firstProducts: ['Supplier and Approval Control', 'Receiving Control'],
  },
  {
    id: 'qms',
    category: 'Quality management and CAPA',
    incumbents: ['ETQ', 'Intelex', 'MasterControl'],
    jobs: ['incident intake', 'containment', 'root-cause review', 'CAPA closeout'],
    aiNativeAngle: 'Make quality entry operationally useful with live defect clusters, batch links, and AI-prepared closeout structure.',
    firstProducts: ['DQMS and Quality Lab', 'Lab SPC and Release'],
  },
  {
    id: 'cmms',
    category: 'Maintenance and reliability',
    incumbents: ['MaintainX', 'UpKeep', 'Fiix'],
    jobs: ['breakdown capture', 'pm execution', 'downtime ranking', 'repeat-failure analysis'],
    aiNativeAngle: 'Move from work-order storage to reliability control with repeat-failure detection and linked root-cause loops.',
    firstProducts: ['Maintenance and Reliability', 'Operations and Reliability review'],
  },
  {
    id: 'mes',
    category: 'Manufacturing execution and traceability',
    incumbents: ['Tulip', 'Plex', 'Ignition'],
    jobs: ['line control', 'batch genealogy', 'process drift watch', 'release readiness'],
    aiNativeAngle: 'Blend operator entry, shopfloor logs, and genealogy into one manufacturing command surface instead of a rigid MES shell.',
    firstProducts: ['Manufacturing Command', 'Manufacturing Genealogy'],
  },
  {
    id: 'bi',
    category: 'BI, planning, and executive review',
    incumbents: ['Power BI', 'Tableau', 'Anaplan'],
    jobs: ['kpi review', 'gap analysis', 'priority reset', 'scenario discussion'],
    aiNativeAngle: 'Turn passive dashboards into action-linked briefings, anomaly packs, and management review loops.',
    firstProducts: ['CEO Command Center', 'Operating Intelligence Studio'],
  },
]

export const AI_FOUNDRY_STAGES: AiFoundryStage[] = [
  {
    id: 'deconstruct',
    name: 'Deconstruct the incumbent',
    detail: 'Extract the winning workflow shape from successful SaaS instead of copying the interface blindly.',
    crews: ['SaaS Deconstruction Pod'],
    artifacts: ['job map', 'state model', 'role matrix'],
  },
  {
    id: 'design',
    name: 'Design the role home',
    detail: 'Build one intuitive home per role with the shortest path from issue to action.',
    crews: ['Experience Systems Pod'],
    artifacts: ['route map', 'entry surfaces', 'queue rules'],
  },
  {
    id: 'compile',
    name: 'Compile workflow and control',
    detail: 'Turn process into states, events, approvals, and bounded automation.',
    crews: ['Workflow Compiler Pod', 'Data Spine Pod'],
    artifacts: ['workflow contract', 'entity graph', 'approval graph'],
  },
  {
    id: 'crew',
    name: 'Attach the AI workforce',
    detail: 'Define which agents draft, watch, rank, summarize, and escalate inside the app.',
    crews: ['Agent Workforce Pod'],
    artifacts: ['agent playbooks', 'tool scopes', 'escalation rules'],
  },
  {
    id: 'promote',
    name: 'Evaluate and promote',
    detail: 'Do not graduate apps until staff can use them cleanly with live data and recover from errors.',
    crews: ['Experience Evals Pod'],
    artifacts: ['ux defect list', 'release recommendation', 'adoption scoreboard'],
  },
]

export const EXPERIENCE_LAWS: ExperienceLaw[] = [
  {
    title: 'Queue first, dashboard second',
    detail: 'The operator must see what to do next before they see the abstract metrics.',
  },
  {
    title: 'One issue, one record',
    detail: 'Chat, email, file, and manual note all collapse into one living record with owner and due date.',
  },
  {
    title: 'Evidence stays inline',
    detail: 'Users should not jump across tools to find the file, email, image, or decision that explains the record.',
  },
  {
    title: 'Forms stay short until depth is needed',
    detail: 'Capture only the fields required to move the work, then open deeper method structure for serious cases.',
  },
  {
    title: 'AI drafts, humans decide',
    detail: 'The system should remove clerical work and prepare judgment, not hide judgment behind automation.',
  },
]

export const FOUNDRY_DIALECTICS: FoundryDialectic[] = [
  {
    id: 'role-home',
    name: 'Role home over software sprawl',
    owner: 'Experience Systems Pod',
    thesis: 'Each role should run from one home with a clear next action.',
    antithesis: 'Real companies still split work across ERP tabs, chat, inboxes, and files.',
    synthesis: 'Portal apps collapse action, evidence, and ownership into one living record per issue.',
    provesIn: ['Operations Control', 'Sales and Dealer Control', 'Receiving Control'],
  },
  {
    id: 'governed-agents',
    name: 'Autonomy without trust loss',
    owner: 'Agent Workforce Pod',
    thesis: 'AI crews can remove clerical drag and keep every queue moving.',
    antithesis: 'Unbounded agents create unsafe writes, vague ownership, and hidden failure.',
    synthesis: 'Crew contracts, tool scopes, approval ladders, and audit visibility keep the AI workforce usable.',
    provesIn: ['Agent Ops', 'Platform Admin', 'Policy Control'],
  },
  {
    id: 'knowledge-spine',
    name: 'Messy company memory into one data spine',
    owner: 'Data Spine Pod',
    thesis: 'Files, mail, notes, and exports should become reusable company memory.',
    antithesis: 'Human-organized data is partial, inconsistent, and changes shape constantly.',
    synthesis: 'A provenance-backed knowledge graph plus controlled human entry surfaces turns mess into operational memory.',
    provesIn: ['Knowledge Graph and SOP Vault', 'Document Intelligence', 'Operating Intelligence Studio'],
  },
  {
    id: 'prototype-to-enterprise',
    name: 'Speed and enterprise control together',
    owner: 'Experience Evals Pod',
    thesis: 'Fast pilots are the fastest way to learn what the product should become.',
    antithesis: 'Pilots collapse when roles, rollout, policy, and support posture stay ad hoc.',
    synthesis: 'Tenant control, release gates, and launch discipline promote live proofs into repeatable modules.',
    provesIn: ['Tenant Control Plane', 'Build Studio', 'Meta workspace'],
  },
]

export const FOUNDRY_HACKATHON_TRACKS: FoundryHackathonTrack[] = [
  {
    id: 'yangon-ops-kernel',
    name: 'Yangon Ops Kernel',
    sprint: '30-day tenant acceleration',
    unitId: 'prototype-studio',
    workspaceIds: ['prototype-floor', 'tenant-launch-room', 'module-release-desk'],
    appRoute: '/app/operations',
    proofRoute: '/clients/yangon-tyre',
    thesis: 'Plant teams should run shift blockers, receiving pressure, quality, and maintenance from one queue.',
    antithesis: 'The real factory still splits those loops across meetings, sheets, and scattered records.',
    synthesis: 'Operations Control, Manufacturing Command, Maintenance Control, and DQMS are promoted as one tenant operating kernel.',
    modules: ['Operations Control', 'Manufacturing Command', 'Maintenance Control', 'DQMS and Quality Methods'],
    crews: ['Operations and Reliability Pod', 'Manufacturing Genealogy Pod', 'Experience Assurance Pod'],
    shipSignal: 'The daily plant review runs from the app and every carryover leaves with an owner.',
  },
  {
    id: 'commercial-memory',
    name: 'Commercial Memory Loop',
    sprint: 'Account memory sprint',
    unitId: 'module-factory',
    workspaceIds: ['research-backlog', 'prototype-floor', 'module-release-desk'],
    appRoute: '/app/revenue',
    proofRoute: '/products/sales-system',
    thesis: 'Sales should run on account memory and next-step discipline, not stage admin.',
    antithesis: 'Visits, quotes, collections, and dealer context are still fragmented across tools.',
    synthesis: 'Sales CRM, lead pipeline, and CEO briefing loops become one evidence-linked commercial system.',
    modules: ['Sales CRM', 'Lead Pipeline', 'CEO Command Center'],
    crews: ['Commercial Memory Pod', 'CEO Brief Pod'],
    shipSignal: 'Priority dealers never sit without an owner, a dated next move, and linked evidence.',
  },
  {
    id: 'industrial-dqms',
    name: 'Industrial DQMS Release',
    sprint: 'Quality methods sprint',
    unitId: 'module-factory',
    workspaceIds: ['prototype-floor', 'module-release-desk', 'model-lab'],
    appRoute: '/app/dqms',
    proofRoute: '/products/industrial-dqms',
    thesis: 'Quality should keep containment, cause path, and closeout evidence on one living case.',
    antithesis: 'Traditional CAPA systems become archives disconnected from lots, lines, and repeat defects.',
    synthesis: 'Industrial DQMS, lab release, and the knowledge spine deliver one controlled quality method surface.',
    modules: ['DQMS and Quality Methods', 'Lab SPC and Release', 'Knowledge Graph and SOP Vault'],
    crews: ['Quality Watch Pod', 'Data Science Pod', 'Experience Assurance Pod'],
    shipSignal: 'Major incidents close with containment, cause path, owner, and evidence on the same record.',
  },
  {
    id: 'tenant-control-kernel',
    name: 'Tenant Control Kernel',
    sprint: 'Enterprise posture sprint',
    unitId: 'governance-runtime',
    workspaceIds: ['runtime-observability', 'module-release-desk', 'tenant-launch-room'],
    appRoute: '/app/platform-admin',
    proofRoute: '/products/tenant-control-plane',
    thesis: 'Enterprise scale needs one control plane for modules, roles, connectors, and rollout.',
    antithesis: 'Fast product work drifts into connector sprawl, role creep, and inconsistent tenant posture.',
    synthesis: 'Tenant Control Plane, Runtime Desk, Connector Control, and Agent Ops become one admin kernel.',
    modules: ['Tenant Control Plane', 'Runtime Desk', 'Connector Control', 'Agent Ops'],
    crews: ['Tenant App Foundry Pod', 'Experience Assurance Pod'],
    shipSignal: 'Every tenant change keeps rollout clarity, audit visibility, and a rollback path.',
  },
  {
    id: 'decision-science',
    name: 'Decision Science Loop',
    sprint: 'Signal-to-decision sprint',
    unitId: 'data-science-lab',
    workspaceIds: ['model-lab', 'research-backlog', 'module-release-desk'],
    appRoute: '/app/insights',
    proofRoute: '/products/data-science-studio',
    thesis: 'Data science should change decisions inside the workflow, not sit in a separate BI stack.',
    antithesis: 'Dashboards remain passive, stale, and weakly connected to operational records.',
    synthesis: 'Operating Intelligence Studio, Data Science Studio, and director briefs form one explainable decision loop.',
    modules: ['Operating Intelligence Studio', 'Data Science Studio', 'CEO Command Center'],
    crews: ['Data Science Pod', 'CEO Brief Pod'],
    shipSignal: 'Every promoted signal shows freshness, provenance, and the next management action.',
  },
]

export const FRONTIER_MODULE_CONCEPTS: FrontierModuleConcept[] = [
  {
    id: 'enterprise-data-fabric',
    name: 'Enterprise Data Fabric',
    category: 'Memory and data spine',
    whyNow: 'Current enterprise AI stacks are racing toward shared business data layers grounded in operational context instead of file silos.',
    thesis: 'SuperMega should unify Gmail, Drive, ERP extracts, and human entry into one governed company memory instead of per-module sync logic.',
    borrowedFrom: ['SAP Knowledge Graph + Business Data Cloud', 'Salesforce Data 360 + Workspace-connected agents'],
    platformMove: 'Turn knowledge graph, provenance, freshness, and relation repair into one reusable tenant memory fabric.',
    route: '/app/knowledge',
  },
  {
    id: 'durable-workflow-orchestrator',
    name: 'Durable Workflow Orchestrator',
    category: 'Agent infrastructure',
    whyNow: 'Durable, resumable workflow systems are becoming the default way to run multi-step AI and business automation reliably.',
    thesis: 'Long-running rollouts, sync repairs, inbox follow-up, and agent jobs should survive deploys, retries, and pauses without custom glue code.',
    borrowedFrom: ['Vercel Workflow', 'Cloudflare Agents SDK'],
    platformMove: 'Promote core launch, sync, and recovery loops into a first-class workflow runtime with state, retries, and observability.',
    route: '/app/runtime',
  },
  {
    id: 'prompt-eval-control',
    name: 'Prompt and Eval Control',
    category: 'AI quality system',
    whyNow: 'Enterprise agent products are differentiating on evaluation discipline, traceability, and prompt/version governance rather than prompt volume.',
    thesis: 'Every major agent loop needs prompt versioning, trace-linked evaluations, datasets, and promotion gates before more autonomy is allowed.',
    borrowedFrom: ['Langfuse prompt management and evaluations'],
    platformMove: 'Create one control surface for prompt versions, experiments, failure classes, reviewer scores, and release promotion.',
    route: '/app/foundry',
  },
  {
    id: 'product-signal-lab',
    name: 'Product Signal Lab',
    category: 'Rollout and product telemetry',
    whyNow: 'Fast product teams now combine analytics, flags, experiments, and warehouse joins so feature decisions happen inside the product loop.',
    thesis: 'Module adoption, feature rollout, and tenant behavior should be measured and gated from one product signal system instead of scattered dashboards.',
    borrowedFrom: ['PostHog feature flags, experiments, and warehouse stack'],
    platformMove: 'Add rollout telemetry, experiments, adoption scorecards, and module flags directly into Platform Admin and Product Ops.',
    route: '/app/platform-admin',
  },
  {
    id: 'industrial-control-point-designer',
    name: 'Industrial Control Point Designer',
    category: 'Operations and quality',
    whyNow: 'Manufacturing suites still center quality checks and alerts around transactions, but operators need issue-to-action systems with methods and evidence inline.',
    thesis: 'Quality checks, alerts, corrective actions, and preventive actions should be authored as reusable control points linked to work orders and receiving flow.',
    borrowedFrom: ['Odoo Quality checks and quality alerts'],
    platformMove: 'Extend DQMS into a reusable control-point layer for manufacturing, inbound, lab, and maintenance workflows.',
    route: '/app/dqms',
  },
]

export const YTF_APP_FOUNDRY_BLUEPRINTS: TenantAppFoundryBlueprint[] = [
  {
    id: 'ceo-command',
    name: 'CEO Command Center',
    route: '/app/director',
    workspace: 'Executive',
    incumbents: ['Power BI', 'NetSuite dashboards', 'manual management decks'],
    coreRecord: 'Executive priority item',
    operatingLoop: 'Exceptions, approvals, commercial risk, and plant debt feed one daily brief and decision queue.',
    thesis: 'Leadership review still runs across dashboards, spreadsheets, approvals, and meeting decks before a priority becomes owned work.',
    antithesis: 'Signal quality drops when decisions live in slides and commercial, plant, and supplier risk arrive in different review loops.',
    synthesis: 'An AI-native director loop compiles one source-linked brief, ranks exceptions, and turns every decision into an accountable next action.',
    aiCrew: 'CEO Brief Pod + Data Science Pod',
    experienceEdge: 'Digest first, source-linked drill-down second, with decisions creating owned next actions immediately.',
    releaseGate: 'Every high-severity claim needs a source record and owner before it appears in the brief.',
    moduleRequirements: [
      { key: 'director-command', name: 'CEO Command Center', match: ['ceo command center', 'director', '/app/director', 'director dashboard'] },
      { key: 'operating-intelligence', name: 'Operating Intelligence Studio', match: ['operating intelligence studio', 'insights', '/app/insights'] },
      { key: 'supplier-approval', name: 'Supplier and Approval Control', match: ['supplier and approval control', 'approvals', '/app/approvals', 'approval flow'] },
    ],
    crewRequirements: [
      { id: 'director-brief', name: 'CEO Brief Pod' },
      { id: 'data-science', name: 'Data Science Pod' },
    ],
    requiredArtifacts: ['daily executive brief', 'decision queue', 'source-linked scenario pack'],
    successSignals: [
      'Every priority item has an owner and due date.',
      'Commercial, plant, and supplier risk refresh inside the same review loop.',
      'Leadership claims always link back to a live record or approved data pack.',
    ],
  },
  {
    id: 'sales-control',
    name: 'Sales and Dealer Control',
    route: '/app/sales',
    workspace: 'Commercial',
    incumbents: ['Salesforce', 'HubSpot', 'Pipedrive'],
    coreRecord: 'Dealer account',
    operatingLoop: 'Visits, quotes, follow-up, credit notes, and next moves sit on one account timeline.',
    thesis: 'Sales follow-up lives across visits, chats, quotes, collections notes, and personal memory around each dealer.',
    antithesis: 'Accounts stall when stage boards hide field reality, next steps are undocumented, and credit risk sits outside the sales workflow.',
    synthesis: 'A shared dealer memory keeps every interaction, drafts the next move, and escalates credit pressure inside the same operating loop.',
    aiCrew: 'Commercial Memory Pod',
    experienceEdge: 'Timeline plus next-step discipline beats a generic CRM stage board for real field follow-up.',
    releaseGate: 'Priority accounts must have one owner, one next step, and linked contact evidence.',
    moduleRequirements: [
      { key: 'sales-crm', name: 'Sales CRM', match: ['sales crm', 'sales and dealer control', '/app/sales', 'sales system'] },
      { key: 'lead-pipeline', name: 'Lead Pipeline', match: ['lead pipeline', '/app/sales/pipeline', 'sales pipeline'] },
      { key: 'director-command', name: 'CEO Command Center', match: ['ceo command center', 'director', '/app/director'] },
    ],
    crewRequirements: [{ id: 'commercial-memory', name: 'Commercial Memory Pod' }],
    requiredArtifacts: ['account timeline', 'next-step discipline pack', 'commercial risk digest'],
    successSignals: [
      'Priority dealers never sit without a dated next action.',
      'Quotes, visits, and collections context share the same account memory.',
      'Credit-sensitive changes escalate into the director loop with evidence attached.',
    ],
  },
  {
    id: 'receiving-control',
    name: 'Receiving Control',
    route: '/app/receiving',
    workspace: 'Inbound',
    incumbents: ['Odoo receiving', 'NetSuite inventory receipts', 'shared sheets'],
    coreRecord: 'Receipt or GRN issue',
    operatingLoop: 'Every mismatch, hold, shortage, or missing document becomes one receipt record with evidence and next action.',
    thesis: 'Receiving staff chase GRN mismatches, missing documents, shortages, and holds across email, calls, sheets, and ERP receipts.',
    antithesis: 'The same inbound issue gets re-entered by plant, supplier, and finance teams, so ownership blurs and evidence goes missing.',
    synthesis: 'One AI-routed receipt record captures the issue once, assembles the evidence bundle, and fans out the next action to supplier, approval, and plant lanes.',
    aiCrew: 'Intake Router Pod + Supplier Recovery Pod',
    experienceEdge: 'The clerk enters the problem once and the plant, supplier, and approval lanes all inherit the same record.',
    releaseGate: 'No inbound issue closes without owner, outcome, and evidence link.',
    moduleRequirements: [
      { key: 'receiving-control', name: 'Receiving Control', match: ['receiving control', '/app/receiving', 'receiving log'] },
      { key: 'operations-control', name: 'Operations Control', match: ['operations control', '/app/operations', 'operations inbox'] },
      { key: 'document-intelligence', name: 'Document Intelligence', match: ['document intelligence', '/app/documents', 'document intake'] },
      { key: 'supplier-approval', name: 'Supplier and Approval Control', match: ['supplier and approval control', '/app/approvals', 'approval flow'] },
    ],
    crewRequirements: [
      { id: 'intake-router', name: 'Intake Router Pod' },
      { id: 'supplier-recovery', name: 'Supplier Recovery Pod' },
    ],
    requiredArtifacts: ['GRN discrepancy record', 'evidence bundle', 'owner-routed follow-up'],
    successSignals: [
      'Inbound issues are opened once and reused across approval, plant, and supplier follow-up.',
      'Hold and shortage records retain document evidence and outcome.',
      'Receiving clerks can route a valid case in one pass without shadow sheets.',
    ],
  },
  {
    id: 'operations-control',
    name: 'Operations Control',
    route: '/app/operations',
    workspace: 'Plant',
    incumbents: ['monday.com', 'Asana', 'ERP task lists'],
    coreRecord: 'Plant blocker',
    operatingLoop: 'Shift notes, receiving pressure, breakdowns, and quality escalations merge into one plant queue.',
    thesis: 'Shift blockers are discussed in meetings, chat threads, and handwritten notes before they appear in any usable queue.',
    antithesis: 'Carryovers slip when receiving, breakdown, and quality pressure stay in separate trackers with no shared owner discipline.',
    synthesis: 'A plant command queue merges live blockers, keeps carryovers owned through shift change, and uses AI to rank what operations must clear next.',
    aiCrew: 'Operations and Reliability Pod',
    experienceEdge: 'Operators and managers see a live action surface instead of separate chat, meeting notes, and trackers.',
    releaseGate: 'Every carryover issue must have a live owner and due date before shift close.',
    moduleRequirements: [
      { key: 'operations-control', name: 'Operations Control', match: ['operations control', '/app/operations', 'operations inbox'] },
      { key: 'receiving-control', name: 'Receiving Control', match: ['receiving control', '/app/receiving'] },
      { key: 'maintenance-control', name: 'Maintenance Control', match: ['maintenance control', 'maintenance and reliability', '/app/maintenance'] },
      { key: 'quality-lab', name: 'DQMS and Quality Methods', match: ['dqms and quality methods', 'dqms and quality lab', '/app/dqms', 'industrial dqms'] },
    ],
    crewRequirements: [{ id: 'operations-reliability', name: 'Operations and Reliability Pod' }],
    requiredArtifacts: ['shift blocker queue', 'carryover ledger', 'cross-functional review pack'],
    successSignals: [
      'Shift carryovers always leave with an owner and due date.',
      'Receiving, maintenance, and quality pressure converge in one plant queue.',
      'Managers can run the daily meeting from the app instead of a separate tracker.',
    ],
  },
  {
    id: 'manufacturing-command',
    name: 'Manufacturing Command',
    route: '/app/operations',
    workspace: 'Factory',
    incumbents: ['Tulip', 'Plex', 'Ignition'],
    coreRecord: 'Line shift record',
    operatingLoop: 'Mixing, component prep, building, curing, and inspection roll into one traceable manufacturing state.',
    thesis: 'Line state is reconstructed from separate production logs, genealogy sheets, maintenance context, and release conversations.',
    antithesis: 'Drift and traceability are hard to trust when stage data is fragmented and nobody sees batch, line, and quality context together.',
    synthesis: 'An AI-native manufacturing surface binds stage flow, genealogy, and drift watch into one operating record that supports control and release decisions.',
    aiCrew: 'Manufacturing Genealogy Pod',
    experienceEdge: 'The factory sees stage flow, genealogy, and drift on the same operating surface instead of scattered logs.',
    releaseGate: 'Line, batch, and stage context must be present before drift alerts or release actions are trusted.',
    moduleRequirements: [
      { key: 'manufacturing-command', name: 'Manufacturing Command', match: ['manufacturing command', '/app/operations', 'operations control'] },
      { key: 'lab-release', name: 'Lab SPC and Release', match: ['lab spc and release', 'lab release', '/app/dqms'] },
      { key: 'quality-lab', name: 'DQMS and Quality Methods', match: ['dqms and quality methods', 'dqms and quality lab', '/app/dqms'] },
      { key: 'maintenance-control', name: 'Maintenance Control', match: ['maintenance control', 'maintenance and reliability', '/app/maintenance'] },
    ],
    crewRequirements: [{ id: 'manufacturing-genealogy', name: 'Manufacturing Genealogy Pod' }],
    requiredArtifacts: ['batch genealogy pack', 'shift drift watch', 'stage-level operating record'],
    successSignals: [
      'Batch, line, and stage lineage are visible before major drift alerts go out.',
      'Traceability can be opened from the same operating surface as daily production review.',
      'Quality and maintenance can see the same manufacturing context without re-entry.',
    ],
  },
  {
    id: 'quality-lab',
    name: 'DQMS and Quality Lab',
    route: '/app/dqms',
    workspace: 'Quality',
    incumbents: ['ETQ', 'Intelex', 'MasterControl'],
    coreRecord: 'Incident and CAPA',
    operatingLoop: 'Containment, 5W1H, Ishikawa, CAPA, and closeout evidence stay on one case timeline.',
    thesis: 'Quality cases move through containment, analysis, CAPA, and closeout across reports, lab notes, and offline templates.',
    antithesis: 'Root-cause work weakens when defect context, lot links, and method evidence stay fragmented across separate files.',
    synthesis: 'A controlled DQMS case timeline prepares method structure automatically while linking lots, assets, defects, and evidence in one record.',
    aiCrew: 'Quality Watch Pod',
    experienceEdge: 'The system prepares method structure and cross-links lots, assets, and defects instead of storing disconnected reports.',
    releaseGate: 'Major incidents require containment, cause path, owner, and evidence before closeout.',
    moduleRequirements: [
      { key: 'quality-lab', name: 'DQMS and Quality Methods', match: ['dqms and quality methods', 'dqms and quality lab', '/app/dqms', 'industrial dqms'] },
      { key: 'lab-release', name: 'Lab SPC and Release', match: ['lab spc and release', 'lab release', '/app/dqms'] },
      { key: 'knowledge-vault', name: 'Knowledge Graph and SOP Vault', match: ['knowledge graph and sop vault', '/app/knowledge', 'knowledge vault'] },
      { key: 'manufacturing-command', name: 'Manufacturing Command', match: ['manufacturing command', '/app/operations'] },
    ],
    crewRequirements: [
      { id: 'quality-watch', name: 'Quality Watch Pod' },
      { id: 'experience-assurance', name: 'Experience Assurance Pod' },
    ],
    requiredArtifacts: ['incident timeline', 'CAPA closeout pack', 'defect cluster review'],
    successSignals: [
      'Major incidents keep containment, cause path, and evidence on the same record.',
      'Recurring defects can be linked back to lot, stage, asset, or supplier context.',
      'Closeout work stays inside the controlled DQMS lane rather than offline reporting.',
    ],
  },
  {
    id: 'maintenance-reliability',
    name: 'Maintenance and Reliability',
    route: '/app/maintenance',
    workspace: 'Reliability',
    incumbents: ['MaintainX', 'UpKeep', 'Fiix'],
    coreRecord: 'Asset event',
    operatingLoop: 'Breakdown, downtime, PM, spare-part risk, and repeat-failure reasoning stay attached to one asset history.',
    thesis: 'Maintenance teams log breakdowns, PM work, parts issues, and downtime reasons in work orders that rarely preserve asset history.',
    antithesis: 'Repeat failures keep reopening because closure hides impact, pattern, and cross-functional context from plant and quality teams.',
    synthesis: 'A reliability loop centers on asset-event history, ranks repeat-failure pressure, and drafts the next intervention before downtime becomes routine.',
    aiCrew: 'Operations and Reliability Pod + Experience Assurance Pod',
    experienceEdge: 'The useful view is repeat-failure pressure and next action, not just a closed work-order list.',
    releaseGate: 'Downtime, owner, and failure pattern must be visible before jobs are considered closed.',
    moduleRequirements: [
      { key: 'maintenance-control', name: 'Maintenance Control', match: ['maintenance control', 'maintenance and reliability', '/app/maintenance'] },
      { key: 'operations-control', name: 'Operations Control', match: ['operations control', '/app/operations'] },
      { key: 'manufacturing-command', name: 'Manufacturing Command', match: ['manufacturing command', '/app/operations'] },
      { key: 'quality-lab', name: 'DQMS and Quality Methods', match: ['dqms and quality methods', 'dqms and quality lab', '/app/dqms'] },
    ],
    crewRequirements: [
      { id: 'operations-reliability', name: 'Operations and Reliability Pod' },
      { id: 'experience-assurance', name: 'Experience Assurance Pod' },
    ],
    requiredArtifacts: ['asset event history', 'downtime reason trail', 'repeat-failure pack'],
    successSignals: [
      'Downtime records always show owner, impact, and next action.',
      'Repeat failures are ranked and investigated rather than reopened as isolated jobs.',
      'Maintenance history stays connected to plant and quality context.',
    ],
  },
  {
    id: 'supplier-approval',
    name: 'Supplier and Approval Control',
    route: '/app/approvals',
    workspace: 'Procurement',
    incumbents: ['SAP approvals', 'Oracle procurement', 'email chains'],
    coreRecord: 'Supplier discrepancy or approval item',
    operatingLoop: 'Missing docs, delayed responses, financial impact, and escalations live in one recovery queue.',
    thesis: 'Procurement and approvals run through inboxes, calls, spreadsheets, and ad hoc follow-up around each shipment or payment issue.',
    antithesis: 'Approvals stall when missing evidence, plant urgency, and financial impact are scattered across different people and threads.',
    synthesis: 'An AI-native recovery queue assembles shipment context, flags the blocking evidence gap, and routes the approval or supplier action with explicit priority.',
    aiCrew: 'Supplier Recovery Pod',
    experienceEdge: 'The queue shows what is blocked and why, instead of hiding the work across inboxes and spreadsheets.',
    releaseGate: 'Every approval item must be tied to shipment, PO, receipt, or financial decision context.',
    moduleRequirements: [
      { key: 'supplier-approval', name: 'Supplier and Approval Control', match: ['supplier and approval control', '/app/approvals', 'approval flow'] },
      { key: 'receiving-control', name: 'Receiving Control', match: ['receiving control', '/app/receiving'] },
      { key: 'document-intelligence', name: 'Document Intelligence', match: ['document intelligence', '/app/documents', 'document intake'] },
      { key: 'director-command', name: 'CEO Command Center', match: ['ceo command center', '/app/director', 'director'] },
    ],
    crewRequirements: [{ id: 'supplier-recovery', name: 'Supplier Recovery Pod' }],
    requiredArtifacts: ['supplier discrepancy pack', 'approval context packet', 'recovery queue'],
    successSignals: [
      'Approvals always carry shipment, receipt, or finance context.',
      'Supplier recovery work is ranked by plant and financial impact.',
      'Managers can see which evidence gaps are blocking release or payment.',
    ],
  },
  {
    id: 'operating-intelligence',
    name: 'Operating Intelligence Studio',
    route: '/app/insights',
    workspace: 'Analytics',
    incumbents: ['Power BI', 'Tableau', 'Anaplan'],
    coreRecord: 'Decision-ready insight pack',
    operatingLoop: 'ERP, quality, plant, and commercial signals become freshness-scored KPI packs, anomalies, and scenario briefs.',
    thesis: 'Management reviews KPI packs, forecasts, and anomalies across BI dashboards, exports, and manually assembled meeting decks.',
    antithesis: 'Insight loses authority when freshness is unclear, provenance is hidden, and leaders cannot jump from KPI drift to the operating record.',
    synthesis: 'A decision studio refreshes the evidence pack, explains why a signal matters, and lets AI draft scenarios directly against live operational context.',
    aiCrew: 'Data Science Pod + CEO Brief Pod',
    experienceEdge: 'Management gets an explainable action pack with freshness and source coverage instead of a passive dashboard wall.',
    releaseGate: 'No forecast or KPI pack is promoted without freshness, provenance, and an accountable reviewer.',
    moduleRequirements: [
      { key: 'operating-intelligence', name: 'Operating Intelligence Studio', match: ['operating intelligence studio', 'insights', '/app/insights'] },
      { key: 'director-command', name: 'CEO Command Center', match: ['ceo command center', '/app/director', 'director'] },
      { key: 'quality-lab', name: 'DQMS and Quality Methods', match: ['dqms and quality methods', 'dqms and quality lab', '/app/dqms'] },
      { key: 'sales-crm', name: 'Sales CRM', match: ['sales crm', 'sales and dealer control', '/app/sales'] },
    ],
    crewRequirements: [
      { id: 'data-science', name: 'Data Science Pod' },
      { id: 'director-brief', name: 'CEO Brief Pod' },
    ],
    requiredArtifacts: ['freshness-scored KPI gap pack', 'forecast brief', 'anomaly watch'],
    successSignals: [
      'Insight packs show freshness and source coverage before any recommendation.',
      'Leaders can move from KPI drift to the underlying operational record without switching tools.',
      'Scenario packs explain why the system is raising a signal, not just that it did.',
    ],
  },
  {
    id: 'admin-control',
    name: 'Admin and Connector Control',
    route: '/app/platform-admin',
    workspace: 'Tenant control',
    incumbents: ['internal admin consoles', 'integration dashboards', 'access spreadsheets'],
    coreRecord: 'Tenant control item',
    operatingLoop: 'Modules, roles, connectors, policies, and AI crews are reviewed from one tenant kernel.',
    thesis: 'Tenant admins manage modules, roles, connectors, and crews across separate consoles, spreadsheets, and technical notes.',
    antithesis: 'Rollouts get brittle when access changes, connector drift, and module posture are reviewed in isolation with weak rollback visibility.',
    synthesis: 'One tenant control surface shows rollout posture, connector scope, and AI crew contracts together so admins can promote safely with audit clarity.',
    aiCrew: 'Tenant App Foundry Pod + Experience Assurance Pod',
    experienceEdge: 'Admin sees rollout gaps, connector drift, and product posture together instead of scattered technical tooling.',
    releaseGate: 'No connector or role change lands without audit visibility and rollback clarity.',
    moduleRequirements: [
      { key: 'platform-admin', name: 'Platform Admin', match: ['platform admin', '/app/platform-admin'] },
      { key: 'runtime-desk', name: 'Runtime Desk', match: ['runtime desk', '/app/runtime'] },
      { key: 'agent-ops', name: 'Agent Ops', match: ['agent ops', '/app/teams'] },
      { key: 'connector-control', name: 'Connector Control', match: ['connector control', '/app/connectors'] },
    ],
    crewRequirements: [
      { id: 'tenant-app-foundry', name: 'Tenant App Foundry Pod' },
      { id: 'experience-assurance', name: 'Experience Assurance Pod' },
    ],
    requiredArtifacts: ['module posture map', 'connector scope matrix', 'role access diff'],
    successSignals: [
      'Connector scope, roles, and module posture can be reviewed from one tenant kernel.',
      'Rollout changes retain audit visibility and rollback clarity.',
      'The app foundry and eval crews can promote modules without losing admin control.',
    ],
  },
]
