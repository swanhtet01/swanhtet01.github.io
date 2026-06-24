export type PlantOsTemplateScreen = {
  id: string
  name: string
  user: string
  job: string
  route: string
}

export type PlantOsAgentCrew = {
  id: string
  name: string
  lane: string
  reads: string
  writes: string
  cadence: string
  route: string
  gate: string
}

export type PlantOsPackageTier = {
  id: string
  name: string
  buyer: string
  promise: string
  includes: string[]
  gate: string
}

export type PlantOsCustomizationAxis = {
  id: string
  label: string
  default: string
  customizeWith: string
}

export const PLANT_OS_TEMPLATE_SCREENS: PlantOsTemplateScreen[] = [
  {
    id: 'manager-entry',
    name: 'Manager entry',
    user: 'Department manager',
    job: 'Record the fact once with owner, due date, and proof.',
    route: '/app/daily-entry',
  },
  {
    id: 'action-board',
    name: 'Action board',
    user: 'Manager and plant manager',
    job: 'Route open issues into one queue with status and next action.',
    route: '/app/action-board',
  },
  {
    id: 'plant-review',
    name: 'Plant review',
    user: 'Plant manager',
    job: 'Review today, close weak evidence, and approve ISO-style drafts.',
    route: '/app/plant-manager',
  },
  {
    id: 'data-fabric',
    name: 'Data fabric',
    user: 'Admin and data steward',
    job: 'Turn Drive, Gmail, files, and forms into source-backed records.',
    route: '/app/data-fabric',
  },
  {
    id: 'admin-setup',
    name: 'Setup and rollout',
    user: 'Tenant admin',
    job: 'Control roles, connectors, domain, data refresh, and release gates.',
    route: '/app/platform-admin',
  },
]

export const PLANT_OS_AGENT_CREWS: PlantOsAgentCrew[] = [
  {
    id: 'source-watch',
    name: 'Source Watch',
    lane: 'Data',
    reads: 'Drive folders, Gmail threads, uploaded files, source register',
    writes: 'Changed-source briefs, freshness flags, candidate owner review',
    cadence: 'Hourly or on scheduled refresh',
    route: '/app/data-fabric',
    gate: 'Human confirms source meaning before KPI promotion.',
  },
  {
    id: 'entry-router',
    name: 'Entry Router',
    lane: 'Workflow',
    reads: 'Manager entry, quick notes, photos, open queue',
    writes: 'Owner, severity, desk, missing-evidence prompt',
    cadence: 'On every submitted entry',
    route: '/app/action-board',
    gate: 'Never closes work automatically.',
  },
  {
    id: 'iso-drafter',
    name: 'Invisible ISO Drafter',
    lane: 'Quality',
    reads: 'Incidents, defects, maintenance notes, proof links',
    writes: '5W1H, CAPA, containment, verification draft',
    cadence: 'On issue escalation or plant review',
    route: '/app/dqms',
    gate: 'Draft only until Plant Manager or QC approves.',
  },
  {
    id: 'reliability-analyst',
    name: 'Reliability Analyst',
    lane: 'Maintenance',
    reads: 'Downtime, machine notes, PM records, spare blockers',
    writes: 'Repeat-fault clusters, next PM suggestion, parts watch',
    cadence: 'Daily close and weekly review',
    route: '/app/maintenance',
    gate: 'Maintenance team confirms the physical action.',
  },
  {
    id: 'brief-builder',
    name: 'Brief Builder',
    lane: 'Leadership',
    reads: 'Open actions, KPI candidates, source changes, approvals',
    writes: 'Plant Manager brief, CEO brief, decision prompts',
    cadence: 'Daily close',
    route: '/app/daily-brief',
    gate: 'High-risk claims need source evidence.',
  },
  {
    id: 'template-builder',
    name: 'Template Builder',
    lane: 'SuperMega product',
    reads: 'Winning YTF screens, module contracts, QA results, client intake',
    writes: 'Reusable PlantOS template packet and launch checklist',
    cadence: 'After every client rollout cycle',
    route: '/app/portal-factory',
    gate: 'A template is sellable only after mobile, route, auth, data, and writeback checks pass.',
  },
]

export const PLANT_OS_PACKAGE_TIERS: PlantOsPackageTier[] = [
  {
    id: 'starter',
    name: 'Starter Plant Portal',
    buyer: 'Owner-led factory or distributor',
    promise: 'Replace scattered notes with entry, action board, and daily review.',
    includes: ['Login and role homes', 'Daily entry', 'Action board', 'Basic source register'],
    gate: 'One team uses it daily for one week.',
  },
  {
    id: 'qms',
    name: 'AI-Native QMS',
    buyer: 'Plant manager, QC lead, maintenance lead',
    promise: 'Hide ISO complexity behind CAPA, 5W1H, evidence, and closeout.',
    includes: ['DQMS', 'Maintenance control', 'Document control', 'Plant review brief'],
    gate: 'One real incident closes with approved evidence.',
  },
  {
    id: 'operating-intelligence',
    name: 'Operating Intelligence',
    buyer: 'CEO, finance, operations leadership',
    promise: 'Turn Drive, email, files, and forms into KPI candidates and decision briefs.',
    includes: ['Data fabric', 'KPI candidate review', 'Knowledge memory', 'Daily/weekly brief'],
    gate: 'Source-backed metrics are promoted or rejected by a human owner.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise PlantOS',
    buyer: 'Multi-site industrial group',
    promise: 'Reusable modules, connector governance, agent workforce, and launch playbook.',
    includes: ['Multi-role rollout', 'Agent Ops', 'Template factory', 'Release gates', 'Custom modules'],
    gate: 'Tenant can be cloned and customized without rebuilding the core.',
  },
]

export const PLANT_OS_CUSTOMIZATION_AXES: PlantOsCustomizationAxis[] = [
  {
    id: 'roles',
    label: 'Role homes',
    default: 'Admin, plant manager, manager',
    customizeWith: 'Split by department, site, authority level, and language.',
  },
  {
    id: 'sources',
    label: 'Source systems',
    default: 'Drive, Gmail, forms, uploads',
    customizeWith: 'ERP exports, accounting sheets, chat channels, sensors, website, social inbox.',
  },
  {
    id: 'modules',
    label: 'Modules',
    default: 'Entry, actions, QMS, maintenance, data fabric',
    customizeWith: 'Sales, receiving, inventory, supplier, lab SPC, calibration, training.',
  },
  {
    id: 'ai-policy',
    label: 'AI policy',
    default: 'Draft and recommend only',
    customizeWith: 'Read scopes, write scopes, approval gates, sensitive-field rules, audit trail.',
  },
  {
    id: 'proof',
    label: 'Proof and QA',
    default: 'Mobile, auth, route, source, writeback checks',
    customizeWith: 'Client-specific acceptance tests and deployment runbooks.',
  },
]

export const PLANT_OS_REEVALUATION = [
  {
    title: 'Strong',
    detail: 'YTF now has role homes, data fabric, Drive-backed source counts, action capture, DQMS, maintenance, and admin setup.',
    status: 'Keep',
  },
  {
    title: 'Weak',
    detail: 'The sellable template is still too hidden, and admin needs a direct view of what can be reused for the next client.',
    status: 'Fix now',
  },
  {
    title: 'Risk',
    detail: 'Agent work must stay gated. AI can draft, route, and summarize, but human approval owns official data and customer-visible output.',
    status: 'Govern',
  },
  {
    title: 'Next',
    detail: 'Turn YTF proof into one compact PlantOS template packet, then run QA and deploy only after the route is stable.',
    status: 'Build',
  },
]
