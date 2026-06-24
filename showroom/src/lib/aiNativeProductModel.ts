export type ProductBlueprintModule = {
  id: string
  name: string
  category: 'Workflow' | 'Knowledge' | 'AI' | 'Control'
  outcome: string
  ownedBy: string
  agentCrews: string[]
  dataScience: string[]
  infrastructure: string[]
  tenants: string[]
  route: string
}

export type PlatformTeamBlueprint = {
  id: string
  name: string
  mandate: string
  owns: string[]
  ships: string[]
}

export type InfrastructureCapability = {
  id: string
  name: string
  purpose: string
  supports: string[]
}

export type DataScienceLane = {
  id: string
  name: string
  purpose: string
  outputs: string[]
  feeds: string[]
}

export type TenantScaleLane = {
  id: string
  stage: string
  focus: string
  adds: string[]
}

export const PRODUCT_BLUEPRINT_MODULES: ProductBlueprintModule[] = [
  {
    id: 'revenue-os',
    name: 'Revenue OS',
    category: 'Workflow',
    outcome: 'Prospecting, account cleanup, follow-up, and pipeline control in one commercial layer.',
    ownedBy: 'Commercial Systems Team',
    agentCrews: ['Revenue Scout', 'List Clerk', 'Founder Brief'],
    dataScience: ['Lead scoring', 'Territory ranking', 'Pipeline forecasting'],
    infrastructure: ['Connector Hub', 'Workflow Runtime', 'Knowledge Graph'],
    tenants: ['Founders', 'Sales teams', 'Distributors'],
    route: '/products/sales-system',
  },
  {
    id: 'operations-erp-core',
    name: 'Industrial ERP and DQMS Core',
    category: 'Workflow',
    outcome: 'Receiving, industrial control, DQMS methods, KPI review, and gap analysis in one operating system.',
    ownedBy: 'Operations Systems Team',
    agentCrews: ['Task Triage', 'Ops Watch', 'Approval Watch'],
    dataScience: ['Quality drift detection', 'KPI gap analysis', 'Downtime and variance signals'],
    infrastructure: ['Workflow Runtime', 'Policy Engine', 'Observability', 'Feature and Metrics Layer'],
    tenants: ['Plants', 'Factories', 'Warehouses', 'Industrial service teams'],
    route: '/products/industrial-dqms',
  },
  {
    id: 'company-memory',
    name: 'Company Memory Graph',
    category: 'Knowledge',
    outcome: 'A canonical memory of companies, files, notes, approvals, and relationships across the tenant.',
    ownedBy: 'Knowledge Systems Team',
    agentCrews: ['Knowledge Curator', 'Connector Watch'],
    dataScience: ['Entity extraction', 'Relationship scoring', 'Retrieval quality'],
    infrastructure: ['Knowledge Graph', 'Document Canon', 'Connector Hub'],
    tenants: ['Every tenant workspace'],
    route: '/products/knowledge-graph',
  },
  {
    id: 'agent-runtime',
    name: 'Agent Runtime',
    category: 'AI',
    outcome: 'Always-on workers that prepare work, monitor drift, and escalate only what needs human attention.',
    ownedBy: 'AI Runtime Team',
    agentCrews: ['Revenue Scout', 'Task Triage', 'Approval Watch', 'Ops Watch', 'Founder Brief'],
    dataScience: ['Agent evals', 'Intervention scoring', 'Autonomy thresholds'],
    infrastructure: ['Agent Runtime', 'Evaluation Harness', 'Policy Engine'],
    tenants: ['Internal factory', 'Client tenants'],
    route: '/products/agent-runtime',
  },
  {
    id: 'director-control',
    name: 'Director Control Tower',
    category: 'Control',
    outcome: 'Cross-team and cross-tenant review of risk, approvals, delivery posture, and performance.',
    ownedBy: 'Control Tower Team',
    agentCrews: ['Founder Brief', 'Ops Watch', 'Approval Watch'],
    dataScience: ['Executive rollups', 'Risk ranking', 'Multi-tenant health scoring'],
    infrastructure: ['Observability', 'Policy Engine', 'Tenant Runtime'],
    tenants: ['Founders', 'Directors', 'Portfolio operators'],
    route: '/products/director-command-center',
  },
  {
    id: 'tenant-control-plane',
    name: 'Tenant Control Plane',
    category: 'Control',
    outcome: 'Domains, roles, connectors, rollout status, and onboarding loops for every tenant.',
    ownedBy: 'Tenant Launch Team',
    agentCrews: ['Tenant Operator', 'Connector Watch', 'Approval Watch'],
    dataScience: ['Adoption scoring', 'rollout risk ranking', 'tenant health scoring'],
    infrastructure: ['Tenant Runtime', 'Connector Hub', 'Policy Engine'],
    tenants: ['Implementation teams', 'Tenant admins', 'Multi-site operators'],
    route: '/products/tenant-control-plane',
  },
  {
    id: 'data-science-studio',
    name: 'Data Science Studio',
    category: 'AI',
    outcome: 'Forecasts, anomaly detection, and next-best-action generated from live workflow state.',
    ownedBy: 'Applied Data Science Team',
    agentCrews: ['Forecast Analyst', 'Founder Brief', 'Knowledge Curator'],
    dataScience: ['Feature marts', 'forecasting', 'anomaly detection', 'scenario scoring'],
    infrastructure: ['Feature and Metrics Layer', 'Knowledge Graph', 'Evaluation Harness'],
    tenants: ['Founders', 'Revenue ops', 'Finance', 'Directors'],
    route: '/products/data-science-studio',
  },
]

export const PLATFORM_TEAM_BLUEPRINTS: PlatformTeamBlueprint[] = [
  {
    id: 'commercial-systems',
    name: 'Commercial Systems Team',
    mandate: 'Own the revenue products that replace CRM sprawl and manual prospecting.',
    owns: ['Revenue OS'],
    ships: ['Account desk', 'Follow-up queue', 'Quote flow', 'Forecast views'],
  },
  {
    id: 'operations-systems',
    name: 'Operations Systems Team',
    mandate: 'Own the industrial workflows that replace generic ERP/QMS behavior with operator-facing control, quality methods, and plant logic.',
    owns: ['Industrial ERP and DQMS Core'],
    ships: ['Receiving Control', 'Industrial DQMS', 'Fishbone and 5W1H desks', 'KPI and gap-analysis reviews'],
  },
  {
    id: 'knowledge-systems',
    name: 'Knowledge Systems Team',
    mandate: 'Turn files, messages, and decisions into canonical tenant memory.',
    owns: ['Company Memory Graph'],
    ships: ['Entity models', 'Document canon', 'Knowledge retrieval', 'Provenance controls'],
  },
  {
    id: 'ai-runtime',
    name: 'AI Runtime Team',
    mandate: 'Operate the worker runtime, evals, safety rules, and intervention thresholds.',
    owns: ['Agent Runtime'],
    ships: ['Agent jobs', 'Eval packs', 'Autonomy controls', 'Escalation paths'],
  },
  {
    id: 'control-tower',
    name: 'Control Tower Team',
    mandate: 'Own founder and director surfaces for multi-team and multi-tenant control.',
    owns: ['Director Control Tower'],
    ships: ['Executive briefs', 'Tenant health', 'Cross-tenant alerts', 'Policy review'],
  },
  {
    id: 'applied-data-science',
    name: 'Applied Data Science Team',
    mandate: 'Turn product events and tenant records into forecasts, scoring, and anomaly detection.',
    owns: ['Shared data-science lanes'],
    ships: ['Forecast models', 'Risk scores', 'Demand signals', 'Operational anomaly models'],
  },
  {
    id: 'tenant-launch',
    name: 'Tenant Launch Team',
    mandate: 'Scale the product core across new companies, domains, roles, and rollout playbooks.',
    owns: ['Tenant Control Plane'],
    ships: ['Tenant setup', 'Role templates', 'Domain launch', 'Adoption loops'],
  },
]

export const INFRASTRUCTURE_CAPABILITIES: InfrastructureCapability[] = [
  {
    id: 'connector-hub',
    name: 'Connector Hub',
    purpose: 'Ingest Gmail, Drive, Sheets, ERP extracts, uploads, and APIs into one runtime.',
    supports: ['Revenue OS', 'Industrial ERP and DQMS Core', 'Company Memory Graph'],
  },
  {
    id: 'knowledge-graph',
    name: 'Knowledge Graph',
    purpose: 'Store canonical entities, relations, decisions, and provenance across each tenant.',
    supports: ['Company Memory Graph', 'Director Control Tower', 'Agent Runtime'],
  },
  {
    id: 'workflow-runtime',
    name: 'Workflow Runtime',
    purpose: 'Run queues, ownership, approvals, and action state for all live modules.',
    supports: ['Revenue OS', 'Industrial ERP and DQMS Core'],
  },
  {
    id: 'policy-engine',
    name: 'Policy Engine',
    purpose: 'Bound write access, escalation, approvals, and safe autonomous work.',
    supports: ['Agent Runtime', 'Industrial ERP and DQMS Core', 'Director Control Tower'],
  },
  {
    id: 'feature-store',
    name: 'Feature and Metrics Layer',
    purpose: 'Expose reusable signals for forecasts, scoring, anomaly detection, and executive review.',
    supports: ['Applied Data Science Team', 'Revenue OS', 'Industrial ERP and DQMS Core'],
  },
  {
    id: 'tenant-runtime',
    name: 'Tenant Runtime',
    purpose: 'Provide tenant config, role scope, domain state, and rollout health across the platform.',
    supports: ['Tenant Launch Team', 'Director Control Tower', 'Agent Runtime'],
  },
  {
    id: 'evaluation-harness',
    name: 'Evaluation Harness',
    purpose: 'Score agent and model quality before automation is promoted into production lanes.',
    supports: ['Agent Runtime', 'Applied Data Science Team', 'Tenant Launch Team'],
  },
  {
    id: 'observability',
    name: 'Runtime Observability',
    purpose: 'Track sync freshness, policy drift, agent behavior, and tenant health.',
    supports: ['Agent Runtime', 'Director Control Tower', 'Tenant scaling'],
  },
]

export const DATA_SCIENCE_LANES: DataScienceLane[] = [
  {
    id: 'forecasting',
    name: 'Forecasting',
    purpose: 'Turn pipeline, stock, throughput, and workload data into forward-looking operating signals.',
    outputs: ['Revenue forecast', 'Demand forecast', 'Capacity pressure', 'throughput forecast'],
    feeds: ['Revenue OS', 'Industrial ERP and DQMS Core', 'Director Control Tower'],
  },
  {
    id: 'anomaly-detection',
    name: 'Anomaly Detection',
    purpose: 'Spot quality drift, outliers, and operational exceptions before they become escalations.',
    outputs: ['Exception spikes', 'quality drift', 'Approval drift', 'Connector failure risk'],
    feeds: ['Industrial ERP and DQMS Core', 'Agent Runtime', 'Runtime Observability'],
  },
  {
    id: 'scoring-and-ranking',
    name: 'Scoring and Ranking',
    purpose: 'Prioritize leads, queues, tasks, KPI gaps, and interventions using shared tenant signals.',
    outputs: ['Lead rank', 'Queue priority', 'Intervention urgency', 'gap priority'],
    feeds: ['Revenue OS', 'Industrial ERP and DQMS Core', 'Agent Runtime'],
  },
  {
    id: 'gap-analysis',
    name: 'Gap Analysis',
    purpose: 'Expose the gap between target and actual performance using quality KPIs, operating methods, and strategy frameworks.',
    outputs: ['KPI gaps', 'corrective priorities', 'SWOT packs'],
    feeds: ['Industrial ERP and DQMS Core', 'Data Science Studio', 'Director Control Tower'],
  },
  {
    id: 'scenario-modeling',
    name: 'Scenario Modeling',
    purpose: 'Show founders and directors the likely result of price, demand, staffing, supplier, or quality changes.',
    outputs: ['what-if scenarios', 'margin sensitivity', 'capacity warnings', 'quality impact views'],
    feeds: ['Data Science Studio', 'Director Control Tower', 'Revenue OS', 'Industrial ERP and DQMS Core'],
  },
]

export const TENANT_SCALE_LANES: TenantScaleLane[] = [
  {
    id: 'single-team',
    stage: 'Single team',
    focus: 'One workflow, one queue, one owner group.',
    adds: ['First live module', 'Basic connectors', 'Role-based access'],
  },
  {
    id: 'single-tenant',
    stage: 'Single tenant',
    focus: 'One company with several roles and connected records.',
    adds: ['Knowledge graph', 'Approvals', 'Agent runtime', 'Director review'],
  },
  {
    id: 'multi-site',
    stage: 'Multi-site',
    focus: 'Several sites or departments sharing module contracts.',
    adds: ['Cross-site controls', 'Shared metrics layer', 'Portfolio rollups'],
  },
  {
    id: 'portfolio',
    stage: 'Portfolio scale',
    focus: 'Many tenants, productized modules, and data-science signals across the platform.',
    adds: ['Reusable module contracts', 'Cross-tenant scoring', 'Control tower'],
  },
]
