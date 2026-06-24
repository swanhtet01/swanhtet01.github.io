export type EnterpriseModuleFamily = {
  id: string
  name: string
  strap: string
  purpose: string
  functions: string[]
  metaTools: string[]
  workspaces: string[]
  frameworks: string[]
  stackLayers: string[]
  agentLoops: string[]
  products: string[]
}

export type EnterpriseMetaTool = {
  id: string
  name: string
  purpose: string
  functions: string[]
  roles: string[]
  route: string
}

export type WorkspaceFramework = {
  id: string
  name: string
  purpose: string
  openStack: string[]
  surfaces: string[]
  controls: string[]
}

export type OpenSourceStackLayer = {
  id: string
  name: string
  purpose: string
  tools: string[]
  status: 'In repo' | 'Recommended next'
}

export type AIOperatingLoop = {
  id: string
  name: string
  purpose: string
  inputs: string[]
  outputs: string[]
  agents: string[]
  reviewGate: string
}

export type PortalCoreFeature = {
  id: string
  name: string
  purpose: string
  includes: string[]
  route: string
}

export type PortalAppSuite = {
  id: string
  name: string
  purpose: string
  modules: string[]
  users: string[]
  dataSources: string[]
  route: string
}

export type RapidDeliveryLoop = {
  id: string
  name: string
  purpose: string
  artifacts: string[]
  agents: string[]
  shipRule: string
}

export const ENTERPRISE_MODULE_FAMILIES: EnterpriseModuleFamily[] = [
  {
    id: 'industrial-control',
    name: 'Industrial Control and DQMS',
    strap: 'The industrial core replaces generic ERP and QMS behavior with operator-facing logic.',
    purpose: 'Run receiving, DQMS, maintenance, approvals, KPI review, fishbone, 5W1H, and corrective action on one runtime.',
    functions: ['receiving control', 'CAPA and closeout', 'fishbone and 5W1H', 'KPI review', 'gap analysis', 'maintenance follow-up'],
    metaTools: ['Runtime Control', 'Connector Control', 'Policy and Security Control', 'Metrics and Model Desk'],
    workspaces: ['plant desk', 'quality desk', 'maintenance desk', 'executive review'],
    frameworks: ['Frontline Workspace Framework', 'Data Science Workspace Framework', 'Agent Workspace Framework'],
    stackLayers: ['API and state layer', 'Analytics and feature engineering', 'Agent orchestration', 'Computer-use and browser automation'],
    agentLoops: ['Data Cleanup Loop', 'DQMS Root-Cause Loop', 'KPI and Gap Analysis Loop'],
    products: ['Operations Inbox', 'Industrial DQMS', 'Approval Policy Engine', 'Document Intelligence'],
  },
  {
    id: 'revenue-control',
    name: 'Revenue and Commercial Control',
    strap: 'Commercial work becomes an operating system instead of a record silo.',
    purpose: 'Keep accounts, opportunities, visits, collections, pricing notes, and follow-up inside one commercial layer.',
    functions: ['account memory', 'pipeline control', 'visit planning', 'quote handoff', 'segment review', 'revenue briefing'],
    metaTools: ['Tenant Architect', 'Metrics and Model Desk', 'Decision Journal'],
    workspaces: ['sales desk', 'director review', 'growth workspace'],
    frameworks: ['Frontline Workspace Framework', 'Knowledge and Graph Framework', 'Agent Workspace Framework'],
    stackLayers: ['API and state layer', 'Analytics and feature engineering', 'Agent orchestration', 'Computer-use and browser automation'],
    agentLoops: ['Data Cleanup Loop', 'KPI and Gap Analysis Loop', 'Executive Brief Loop'],
    products: ['Sales System', 'Founder Brief', 'Knowledge Graph'],
  },
  {
    id: 'knowledge-control',
    name: 'Knowledge, Records, and Memory',
    strap: 'Files, notes, approvals, and structured records should become reusable company memory.',
    purpose: 'Turn documents, markdown notes, decision trails, and extracted entities into a shared graph every module can use.',
    functions: ['document canon', 'entity linking', 'decision traceability', 'source provenance', 'SOP publishing', 'record promotion'],
    metaTools: ['Knowledge Control', 'Document Intake', 'Policy and Security Control'],
    workspaces: ['knowledge desk', 'document review', 'decision journal'],
    frameworks: ['Knowledge and Graph Framework', 'Agent Workspace Framework', 'Tenant Admin Framework'],
    stackLayers: ['API and state layer', 'Agent orchestration', 'Evaluation and promotion'],
    agentLoops: ['Data Cleanup Loop'],
    products: ['Knowledge Graph', 'Decision Journal', 'Document Intelligence'],
  },
  {
    id: 'tenant-runtime',
    name: 'Tenant Runtime and Control',
    strap: 'Domains, access, rollout, autonomy, and governance should be explicit platform products.',
    purpose: 'Launch and scale workspaces with named domains, role templates, connector scopes, runtime posture, and release discipline.',
    functions: ['tenant launch', 'role mapping', 'domain onboarding', 'connector posture', 'autonomy gates', 'portfolio review'],
    metaTools: ['Platform Admin', 'Cloud Ops', 'Product Ops', 'Build Studio', 'Agent Ops'],
    workspaces: ['tenant control plane', 'build control', 'runtime review'],
    frameworks: ['Tenant Admin Framework', 'Agent Workspace Framework', 'Knowledge and Graph Framework'],
    stackLayers: ['API and state layer', 'Agent orchestration', 'Computer-use and browser automation', 'Evaluation and promotion'],
    agentLoops: ['Tenant Launch Loop', 'Executive Brief Loop'],
    products: ['Tenant Control Plane', 'Agent Runtime', 'Director Command Center', 'Data Science Studio'],
  },
]

export const ENTERPRISE_META_TOOLS: EnterpriseMetaTool[] = [
  {
    id: 'cloud-ops',
    name: 'Cloud Ops',
    purpose: 'Map pods, environments, service lanes, and internal control surfaces into one cloud operating layer.',
    functions: ['environment topology', 'pod ownership', 'service-lane review', 'cloud setup sequencing'],
    roles: ['admin', 'director', 'implementation lead'],
    route: '/app/cloud',
  },
  {
    id: 'runtime-control',
    name: 'Runtime Control',
    purpose: 'Monitor connector health, canon quality, autonomy load, and production drift across the tenant runtime.',
    functions: ['runtime posture', 'autonomy review', 'connector drift', 'cross-module health'],
    roles: ['admin', 'ceo', 'implementation lead'],
    route: '/app/runtime',
  },
  {
    id: 'model-ops',
    name: 'Model Ops',
    purpose: 'Govern provider readiness, routing contracts, benchmark drills, and crew-to-model fit before autonomy scales.',
    functions: ['provider posture', 'routing review', 'benchmark drills', 'crew-to-model contracts'],
    roles: ['admin', 'ceo', 'implementation lead', 'security lead'],
    route: '/app/model-ops',
  },
  {
    id: 'platform-admin',
    name: 'Platform Admin',
    purpose: 'Own modules, roles, zones, rollout posture, and tenant configuration from one control plane.',
    functions: ['tenant posture', 'role templates', 'module enablement', 'security review'],
    roles: ['admin', 'ceo', 'implementation lead'],
    route: '/app/platform-admin',
  },
  {
    id: 'tenant-architect',
    name: 'Tenant Architect',
    purpose: 'Map a company into workspaces, modules, connectors, operating methods, and rollout order.',
    functions: ['company blueprinting', 'module mapping', 'source mapping', 'gap sequencing'],
    roles: ['admin', 'implementation lead', 'product owner'],
    route: '/app/architect',
  },
  {
    id: 'connector-control',
    name: 'Connector Control',
    purpose: 'Keep Gmail, Drive, ERP, files, and human-entry sources healthy, scoped, and auditable.',
    functions: ['freshness monitoring', 'scope review', 'backlog triage', 'writeback controls'],
    roles: ['admin', 'connector operator'],
    route: '/app/connectors',
  },
  {
    id: 'knowledge-control',
    name: 'Knowledge Control',
    purpose: 'Promote files, notes, metrics, and entities into trusted records and business memory.',
    functions: ['canon review', 'entity quality', 'relation coverage', 'promotion gates'],
    roles: ['admin', 'knowledge lead', 'ceo'],
    route: '/app/knowledge',
  },
  {
    id: 'policy-control',
    name: 'Policy and Security Control',
    purpose: 'Bound what humans and agents can read, write, escalate, or promote.',
    functions: ['approval rules', 'field protection', 'audit review', 'autonomy policy'],
    roles: ['admin', 'security lead', 'ceo'],
    route: '/app/policies',
  },
  {
    id: 'document-intake',
    name: 'Document Intake',
    purpose: 'Extract fields, route source files, and push raw documents into structured work or canon review.',
    functions: ['document ingest', 'field extraction', 'routing review', 'evidence triage'],
    roles: ['operations', 'admin', 'documents lead'],
    route: '/app/intake',
  },
  {
    id: 'decision-journal',
    name: 'Decision Journal',
    purpose: 'Keep the reasoning, approver trail, and outcome record attached to operational work.',
    functions: ['decision logging', 'approver trail', 'evidence link', 'outcome review'],
    roles: ['ceo', 'admin', 'manager'],
    route: '/app/decisions',
  },
  {
    id: 'metrics-model-desk',
    name: 'Metrics and Model Desk',
    purpose: 'Run KPI control, feature engineering, SWOT packs, gap analysis, anomaly triage, and forecast review.',
    functions: ['metric intake', 'feature refresh', 'gap packs', 'SWOT review', 'forecast review'],
    roles: ['ceo', 'admin', 'operations', 'sales'],
    route: '/app/insights',
  },
  {
    id: 'product-ops',
    name: 'Product Ops',
    purpose: 'Manage release trains, product health, research cells, and module graduation across the portfolio.',
    functions: ['release tracking', 'portfolio review', 'readiness scoring', 'research alignment'],
    roles: ['product owner', 'admin', 'implementation lead'],
    route: '/app/product-ops',
  },
  {
    id: 'build-studio',
    name: 'Build Studio',
    purpose: 'Turn pilots into products with release gates, shared infrastructure, and repeatable module programs.',
    functions: ['module factory', 'release gates', 'shared stack planning', 'research backlog'],
    roles: ['product owner', 'admin', 'implementation lead'],
    route: '/app/factory',
  },
  {
    id: 'agent-ops',
    name: 'Agent Ops',
    purpose: 'Operate AI crews with explicit read scope, write scope, jobs, and approval boundaries.',
    functions: ['job review', 'agent roster', 'approval tracking', 'autonomy oversight'],
    roles: ['admin', 'implementation lead', 'product owner'],
    route: '/app/teams',
  },
]

export const WORKSPACE_FRAMEWORKS: WorkspaceFramework[] = [
  {
    id: 'frontline-workspace',
    name: 'Frontline Workspace Framework',
    purpose: 'Queue-first workspaces for operators who need one clear owner, next action, and evidence trail.',
    openStack: ['React Router workspace shell', 'FastAPI service layer', 'SQLModel records'],
    surfaces: ['action board', 'receiving desk', 'DQMS desk', 'approval lane'],
    controls: ['owner tracking', 'status transitions', 'audit history'],
  },
  {
    id: 'knowledge-workspace',
    name: 'Knowledge and Graph Framework',
    purpose: 'A shared memory layer for notes, files, entities, relations, and decision context.',
    openStack: ['FastAPI APIs', 'SQLModel state', 'markdown vault sync'],
    surfaces: ['knowledge desk', 'document canon', 'decision journal', 'relation review'],
    controls: ['source provenance', 'canon promotion', 'sensitive-link review'],
  },
  {
    id: 'data-science-workspace',
    name: 'Data Science Workspace Framework',
    purpose: 'A tenant-aware analysis and feature-engineering lane for KPI control and operating intelligence.',
    openStack: ['DuckDB', 'Polars', 'FastAPI model services'],
    surfaces: ['metric intake', 'feature mart', 'forecast review', 'gap-analysis packs'],
    controls: ['dataset freshness', 'model review', 'explanation logs'],
  },
  {
    id: 'agent-workspace',
    name: 'Agent Workspace Framework',
    purpose: 'Employ AI workers into bounded workspaces with explicit read scope, write scope, and approval gates.',
    openStack: ['LangGraph', 'Celery', 'Playwright'],
    surfaces: ['agent ops', 'runtime desk', 'job history', 'approval review'],
    controls: ['approval gates', 'retries', 'evals', 'rollback-safe promotion'],
  },
  {
    id: 'tenant-admin-workspace',
    name: 'Tenant Admin Framework',
    purpose: 'Manage domains, users, scopes, modules, rollout phases, and control-plane posture for each company.',
    openStack: ['FastAPI', 'SQLModel', 'PostgreSQL or SQLite'],
    surfaces: ['platform admin', 'tenant architect', 'connector control', 'security control'],
    controls: ['RBAC', 'scope templates', 'launch checklists', 'policy enforcement'],
  },
]

export const OPEN_SOURCE_STACK_LAYERS: OpenSourceStackLayer[] = [
  {
    id: 'api-state',
    name: 'API and state layer',
    purpose: 'Serve app APIs, persist tenant state, and model business records.',
    tools: ['FastAPI', 'SQLModel', 'PostgreSQL', 'SQLite'],
    status: 'In repo',
  },
  {
    id: 'analytics',
    name: 'Analytics and feature engineering',
    purpose: 'Clean exports, build features, score anomalies, and support data-science workspaces.',
    tools: ['DuckDB', 'Polars'],
    status: 'In repo',
  },
  {
    id: 'agent-orchestration',
    name: 'Agent orchestration',
    purpose: 'Run long-lived AI worker loops with graph logic, retries, and task scheduling.',
    tools: ['LangGraph', 'Celery'],
    status: 'In repo',
  },
  {
    id: 'computer-use',
    name: 'Computer-use and browser automation',
    purpose: 'Give agent teams browser and UI execution for extraction, workflow actions, and QA.',
    tools: ['Playwright'],
    status: 'In repo',
  },
  {
    id: 'evaluation',
    name: 'Evaluation and promotion',
    purpose: 'Measure whether model-backed or autonomous work is safe enough to promote into live lanes.',
    tools: ['Pydantic', 'PydanticAI', 'evaluation harnesses'],
    status: 'Recommended next',
  },
]

export const AI_OPERATING_LOOPS: AIOperatingLoop[] = [
  {
    id: 'data-cleanup',
    name: 'Data Cleanup Loop',
    purpose: 'Normalize raw imports, files, and messages into cleaner tenant records before humans act on them.',
    inputs: ['Gmail', 'Drive', 'ERP exports', 'manual entry'],
    outputs: ['clean datasets', 'deduped records', 'field repairs'],
    agents: ['List Clerk', 'Memory Curator', 'Data Science Pod'],
    reviewGate: 'Human accepts merges and sensitive corrections.',
  },
  {
    id: 'dqms-root-cause',
    name: 'DQMS Root-Cause Loop',
    purpose: 'Prepare fishbone, 5W1H, corrective action, and incident structure for industrial teams.',
    inputs: ['incidents', 'maintenance logs', 'inspection evidence', 'quality KPIs'],
    outputs: ['root-cause drafts', 'corrective priorities', 'closeout starters'],
    agents: ['Quality Architect', 'Ops Watch'],
    reviewGate: 'Quality or operations lead approves closeout and supplier-impact changes.',
  },
  {
    id: 'gap-analysis',
    name: 'KPI and Gap Analysis Loop',
    purpose: 'Compare target vs actual performance and rank the biggest management gaps.',
    inputs: ['metric rows', 'targets', 'forecast outputs', 'manager notes'],
    outputs: ['gap packs', 'KPI alerts', 'SWOT review inputs'],
    agents: ['Forecast Analyst', 'Data Science Pod'],
    reviewGate: 'CEO or admin reviews any strategy or policy recommendation.',
  },
  {
    id: 'executive-brief',
    name: 'Executive Brief Loop',
    purpose: 'Condense revenue, operations, DQMS, and runtime drift into one short review for leadership.',
    inputs: ['queues', 'forecasts', 'approvals', 'decision history'],
    outputs: ['daily brief', 'risk ranking', 'intervention suggestions'],
    agents: ['Founder Brief', 'CEO Brief Pod'],
    reviewGate: 'Leadership reviews external or portfolio-facing summaries.',
  },
  {
    id: 'tenant-launch',
    name: 'Tenant Launch Loop',
    purpose: 'Prepare domains, roles, connectors, and rollout tasks so each portal launches from the same operating standard.',
    inputs: ['company blueprint', 'workspace roles', 'source maps', 'module selection'],
    outputs: ['launch checklist', 'domain prep', 'role map', 'implementation gaps'],
    agents: ['Tenant Operator', 'Runtime Orchestrator'],
    reviewGate: 'Tenant admin approves scope and production go-live.',
  },
]

export const PORTAL_CORE_FEATURES: PortalCoreFeature[] = [
  {
    id: 'portal-identity',
    name: 'Role-based portal shell',
    purpose: 'Give every user one home screen, one navigation model, and scoped access by role and tenant.',
    includes: ['role homes', 'tenant-aware routes', 'workspace navigation', 'session and capability checks'],
    route: '/app/platform-admin',
  },
  {
    id: 'portal-workflow',
    name: 'Workflow and action layer',
    purpose: 'Run queues, assignments, approvals, and operational work without users jumping between tools.',
    includes: ['action boards', 'receiving records', 'approvals', 'task queues'],
    route: '/app/workbench',
  },
  {
    id: 'portal-memory',
    name: 'Company memory and knowledge graph',
    purpose: 'Turn files, notes, messages, decisions, and extracted entities into reusable company memory.',
    includes: ['document canon', 'knowledge graph', 'decision journal', 'SOP vault'],
    route: '/app/knowledge',
  },
  {
    id: 'portal-connectors',
    name: 'Connectors and sync controls',
    purpose: 'Bring Gmail, Drive, Calendar, ERP exports, forms, and uploaded files into the same runtime with controls.',
    includes: ['connector health', 'freshness review', 'import scopes', 'source mapping'],
    route: '/app/connectors',
  },
  {
    id: 'portal-governance',
    name: 'Approvals, audit, and security',
    purpose: 'Keep human and agent work bounded with approvals, audit history, and policy controls.',
    includes: ['approval gates', 'field protection', 'audit trails', 'policy review'],
    route: '/app/policies',
  },
  {
    id: 'portal-ai',
    name: 'AI and agent operating layer',
    purpose: 'Run cleanup, analysis, drafting, alerts, and brief generation inside the portal instead of outside it.',
    includes: ['agent jobs', 'autonomy review', 'exec briefs', 'safe escalation'],
    route: '/app/runtime',
  },
]

export const PORTAL_APP_SUITES: PortalAppSuite[] = [
  {
    id: 'sales-crm',
    name: 'Sales CRM and revenue workspace',
    purpose: 'Accounts, follow-up, visits, collections, and revenue review in one commercial app.',
    modules: ['lead pipeline', 'account memory', 'follow-up queue', 'director brief'],
    users: ['sales', 'growth', 'ceo'],
    dataSources: ['Gmail', 'Calendar', 'Sheets', 'manual updates'],
    route: '/products/sales-system',
  },
  {
    id: 'operations-erp',
    name: 'Operations ERP workspace',
    purpose: 'Receiving, stock pressure, issues, supplier recovery, and daily control in one industrial app.',
    modules: ['receiving control', 'inventory pulse', 'action board', 'approval queue'],
    users: ['operations', 'warehouse', 'admin'],
    dataSources: ['ERP exports', 'forms', 'manual entry', 'uploads'],
    route: '/products/operations-inbox',
  },
  {
    id: 'dqms',
    name: 'DQMS and quality workspace',
    purpose: 'Incidents, CAPA, fishbone, 5W1H, KPI review, and gap analysis in one quality app.',
    modules: ['incident intake', 'CAPA board', 'fishbone prep', 'KPI review'],
    users: ['quality', 'operations', 'ceo'],
    dataSources: ['inspection records', 'quality metrics', 'files', 'manager notes'],
    route: '/products/industrial-dqms',
  },
  {
    id: 'maintenance',
    name: 'Maintenance and asset workspace',
    purpose: 'Track breakdowns, PM schedules, spare-part blockers, and downtime follow-up inside the same portal.',
    modules: ['maintenance log', 'downtime review', 'parts blockers', 'approval handoff'],
    users: ['maintenance', 'operations', 'admin'],
    dataSources: ['maintenance records', 'inventory', 'forms', 'device uploads'],
    route: '/app/maintenance',
  },
  {
    id: 'knowledge-app',
    name: 'Knowledge graph and document workspace',
    purpose: 'Keep the company memory usable for humans and agents instead of scattered across folders and chat.',
    modules: ['document intake', 'knowledge review', 'decision journal', 'SOP vault'],
    users: ['admin', 'ceo', 'knowledge owners'],
    dataSources: ['Drive', 'docs', 'notes', 'uploaded files'],
    route: '/products/knowledge-graph',
  },
  {
    id: 'executive-control',
    name: 'Executive control and data science workspace',
    purpose: 'Combine KPI gaps, forecasts, anomalies, scenarios, and leadership briefs in one management app.',
    modules: ['insights desk', 'runtime overview', 'founder brief', 'scenario review'],
    users: ['ceo', 'directors', 'admins'],
    dataSources: ['workflow state', 'feature marts', 'knowledge graph', 'approvals'],
    route: '/products/data-science-studio',
  },
]

export const RAPID_DELIVERY_LOOPS: RapidDeliveryLoop[] = [
  {
    id: 'prototype-loop',
    name: 'Fast prototype loop',
    purpose: 'Turn a painful workflow into a working role-specific desk quickly enough to test with a real team.',
    artifacts: ['live desk', 'starter schema', 'sample imports', 'demo walkthrough'],
    agents: ['Tenant Operator', 'Runtime Orchestrator', 'List Clerk'],
    shipRule: 'Ship only when one user can complete one real job without leaving the portal.',
  },
  {
    id: 'gen-ai-upgrade',
    name: 'Gen AI upgrade loop',
    purpose: 'Add extraction, drafting, cleanup, and next-best-action features after the manual workflow is stable.',
    artifacts: ['prompt pack', 'output schema', 'approval gate', 'evaluation notes'],
    agents: ['Knowledge Curator', 'Forecast Analyst', 'Quality Architect'],
    shipRule: 'Promote only the AI actions that are measurable, reviewable, and reversible.',
  },
  {
    id: 'data-science-upgrade',
    name: 'Data science upgrade loop',
    purpose: 'Build feature marts, anomaly signals, forecasting, and gap-analysis packs from live workflow data.',
    artifacts: ['feature tables', 'scoring logic', 'anomaly views', 'scenario packs'],
    agents: ['Data Science Pod', 'Founder Brief', 'Ops Watch'],
    shipRule: 'The model must drive a clearer human decision, not just produce another chart.',
  },
  {
    id: 'continuous-product-loop',
    name: 'Continuous product update loop',
    purpose: 'Keep each tenant portal improving through connector hardening, app upgrades, and agent tuning.',
    artifacts: ['release notes', 'tenant change log', 'new routes', 'post-launch QA'],
    agents: ['Connector Watch', 'Approval Watch', 'CEO Brief Pod'],
    shipRule: 'Every release must improve one live role, one live metric, or one real workflow bottleneck.',
  },
]

export function getEnterpriseFamiliesForProduct(productName: string | null | undefined) {
  const normalized = normalizeLabel(productName)

  return ENTERPRISE_MODULE_FAMILIES.filter((family) =>
    family.products.some((product) => normalizeLabel(product) === normalized),
  )
}

function normalizeLabel(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function getUniqueMatches<T extends { name: string }>(items: T[], names: string[]) {
  const targetNames = new Set(names.map((name) => normalizeLabel(name)).filter(Boolean))

  return items.filter((item) => targetNames.has(normalizeLabel(item.name)))
}

export function getEnterpriseMetaTools(names: string[]) {
  return getUniqueMatches(ENTERPRISE_META_TOOLS, names)
}

export function getWorkspaceFrameworkDetails(names: string[]) {
  return getUniqueMatches(WORKSPACE_FRAMEWORKS, names)
}

export function getOpenSourceLayerDetails(names: string[]) {
  return getUniqueMatches(OPEN_SOURCE_STACK_LAYERS, names)
}

export function getAIOperatingLoopDetails(names: string[]) {
  return getUniqueMatches(AI_OPERATING_LOOPS, names)
}
