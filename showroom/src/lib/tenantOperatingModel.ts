export type OperatingModelModule = {
  id: string
  name: string
  category: 'CRM' | 'ERP' | 'Knowledge' | 'Portal' | 'Automation' | 'Control'
  status: 'Live now' | 'Rollout ready' | 'Next module' | 'Control layer'
  summary: string
  users: string[]
  route?: string
  dataFlows: string[]
  controls: string[]
}

export type OperatingModelRole = {
  id: string
  name: string
  summary: string
  defaultHome: string
  capabilities: string[]
  securityZones: string[]
  workspaces: string[]
}

export type OperatingModelSecurityZone = {
  id: string
  name: string
  summary: string
  controls: string[]
  visibleTo: string[]
}

export type OperatingModelConnector = {
  id: string
  name: string
  source: string
  scope: string
  cadence: string
  outputs: string[]
  adminOwner: string
  writeBack: string
}

export type OperatingModelKnowledgeEntity = {
  id: string
  name: string
  summary: string
  sourceOfTruth: string
  updatePattern: string
  feeds: string[]
}

export type OperatingModelDataEntrySurface = {
  id: string
  name: string
  users: string[]
  route?: string
  captures: string[]
  qualityRules: string[]
}

export type OperatingModelAgentPod = {
  id: string
  name: string
  purpose: string
  workspace: string
  leadRole: string
  members: string[]
  readScope: string[]
  writeScope: string[]
  approvalGate: string
  automations: string[]
}

export type OperatingModelFoundationSignal = {
  id: string
  name: string
  status: 'Live now' | 'Needs wiring' | 'Next build'
  detail: string
}

export type OperatingModelGap = {
  id: string
  name: string
  risk: string
  nextMove: string
}

export type OperatingModelTeam = {
  id: string
  name: string
  workspace: string
  mission: string
  scope: string[]
  successMetric: string
}

export type OperatingModelRolloutPhase = {
  id: string
  name: string
  outcome: string
  modules: string[]
  deliverables: string[]
}

export type TenantOperatingModel = {
  id: 'supermega-core' | 'yangon-tyre'
  tenantKey: 'default' | 'ytf-plant-a'
  companyName: string
  publicLabel: string
  domain: string
  sector: string
  thesis: string
  narrative: string
  paradigmShifts: string[]
  modules: OperatingModelModule[]
  roles: OperatingModelRole[]
  securityZones: OperatingModelSecurityZone[]
  connectors: OperatingModelConnector[]
  knowledgeGraph: OperatingModelKnowledgeEntity[]
  dataEntrySurfaces: OperatingModelDataEntrySurface[]
  agentPods: OperatingModelAgentPod[]
  foundationSignals: OperatingModelFoundationSignal[]
  gaps: OperatingModelGap[]
  platformTeams: OperatingModelTeam[]
  rolloutPhases: OperatingModelRolloutPhase[]
}

export const SUPERMEGA_CORE_MODEL: TenantOperatingModel = {
  id: 'supermega-core',
  tenantKey: 'default',
  companyName: 'SUPERMEGA.dev Core Platform',
  publicLabel: 'SUPERMEGA.dev Core',
  domain: 'app.supermega.dev',
  sector: 'multi-tenant operating software',
  thesis: 'One AI-native runtime for CRM, ERP, portals, knowledge, and control layers.',
  narrative:
    'The platform already has real Gmail, Drive, document-intake, metric-intake, workspace-auth, and agent-run primitives. The next paradigm shift is turning those scattered primitives into one tenant-scoped operating substrate with canonical records, richer security, and event-driven knowledge updates.',
  paradigmShifts: [
    'Replace tool categories with shared business modules on one runtime.',
    'Turn inboxes, folders, sheets, and exports into canonical records with provenance.',
    'Move agent work from chat helpers into permissioned queues and review loops.',
    'Treat every tenant like a configurable operating system, not a one-off project.',
  ],
  modules: [
    {
      id: 'platform-admin',
      name: 'Platform Admin',
      category: 'Control',
      status: 'Control layer',
      summary: 'Cross-tenant provisioning, policy, runtime posture, and rollout control.',
      users: ['platform admin', 'product owner', 'implementation lead'],
      route: '/app/platform-admin',
      dataFlows: ['tenant setup', 'module enablement', 'connector posture'],
      controls: ['tenant settings', 'plan posture', 'security posture'],
    },
    {
      id: 'solution-architect',
      name: 'Solution Architect',
      category: 'Control',
      status: 'Live now',
      summary: 'Maps a client operating profile into modules, data sources, and rollout order.',
      users: ['implementation lead', 'product owner'],
      route: '/app/architect',
      dataFlows: ['sector profile', 'tooling inputs', 'data-source mapping'],
      controls: ['rollout blueprint', 'module selection', 'agent-team selection'],
    },
    {
      id: 'agent-ops',
      name: 'Agent Ops',
      category: 'Automation',
      status: 'Live now',
      summary: 'Runs core job types, shows runtime health, and manages workspace members.',
      users: ['operator', 'manager', 'tenant admin'],
      route: '/app/teams',
      dataFlows: ['agent runs', 'team members', 'manual jobs'],
      controls: ['job triggers', 'runtime review', 'workspace access'],
    },
    {
      id: 'knowledge-runtime',
      name: 'Knowledge Runtime',
      category: 'Knowledge',
      status: 'Rollout ready',
      summary: 'Canonical documents, chunks, entities, relations, and provenance tied to tenants.',
      users: ['product owner', 'connector reliability pod', 'knowledge graph pod'],
      route: '/app/knowledge',
      dataFlows: ['documents', 'chunks', 'entities', 'relations'],
      controls: ['source provenance', 'knowledge quality', 'retrieval policy'],
    },
    {
      id: 'connector-control',
      name: 'Connector Control',
      category: 'Control',
      status: 'Rollout ready',
      summary: 'Feed health, freshness, backlog, source maps, and connector automation plans across tenants.',
      users: ['platform admin', 'tenant operator', 'implementation lead'],
      route: '/app/connectors',
      dataFlows: ['mailbox sync', 'Drive indexes', 'ERP export lanes', 'GitHub delivery signals'],
      controls: ['connector scope', 'source reliability', 'retry posture'],
    },
    {
      id: 'security-control',
      name: 'Security Control',
      category: 'Control',
      status: 'Rollout ready',
      summary: 'Trust boundaries, sensitive-field posture, tenant visibility, and audit coverage across the runtime.',
      users: ['platform admin', 'implementation lead', 'finance controller'],
      route: '/app/security',
      dataFlows: ['zone audits', 'access posture', 'sensitive-write review', 'tenant trust maps'],
      controls: ['security zones', 'approval boundaries', 'audit coverage'],
    },
    {
      id: 'policy-runtime',
      name: 'Policy Runtime',
      category: 'Control',
      status: 'Rollout ready',
      summary: 'Guardrails for connector scope, knowledge promotion, sensitive writes, and release gates.',
      users: ['platform admin', 'finance controller', 'implementation lead'],
      route: '/app/policies',
      dataFlows: ['approval events', 'guardrail audits', 'policy exceptions'],
      controls: ['approval gates', 'sensitive fields', 'autonomous write boundaries'],
    },
    {
      id: 'product-ops',
      name: 'Product Ops',
      category: 'Control',
      status: 'Rollout ready',
      summary: 'Release trains, research cells, crew scope, and module graduation for the SuperMega product company.',
      users: ['product owner', 'implementation lead', 'platform admin'],
      route: '/app/product-ops',
      dataFlows: ['program status', 'release trains', 'success signals', 'crew mandates'],
      controls: ['release gates', 'R&D prioritization', 'program accountability'],
    },
  ],
  roles: [
    {
      id: 'platform_admin',
      name: 'Platform Admin',
      summary: 'Owns tenant posture, platform rules, and cross-tenant infrastructure.',
      defaultHome: '/app/platform-admin',
      capabilities: ['platform_admin.view', 'tenant_admin.view', 'security_admin.view', 'connector_admin.view', 'architect.view'],
      securityZones: ['platform-control', 'shared-knowledge'],
      workspaces: ['core-platform', 'tenant-rollouts'],
    },
    {
      id: 'implementation_lead',
      name: 'Implementation Lead',
      summary: 'Translates client workflows into modules, connectors, and rollout tasks.',
      defaultHome: '/app/architect',
      capabilities: ['tenant_admin.view', 'architect.view', 'knowledge_admin.view'],
      securityZones: ['platform-control', 'shared-knowledge'],
      workspaces: ['tenant-rollouts'],
    },
    {
      id: 'tenant_operator',
      name: 'Tenant Operator',
      summary: 'Monitors a client pod, triages runtime issues, and keeps agents healthy.',
      defaultHome: '/app/teams',
      capabilities: ['agent_ops.view', 'approvals.view', 'actions.view'],
      securityZones: ['platform-control'],
      workspaces: ['tenant-ops'],
    },
  ],
  securityZones: [
    {
      id: 'platform-control',
      name: 'Platform Control',
      summary: 'Cross-tenant configuration, rollout, and governance.',
      controls: ['tenant provisioning', 'module enablement', 'runtime policies'],
      visibleTo: ['platform_admin', 'implementation_lead'],
    },
    {
      id: 'shared-knowledge',
      name: 'Shared Knowledge',
      summary: 'Reusable playbooks, product memory, and architecture standards.',
      controls: ['knowledge reuse', 'template governance', 'architecture notes'],
      visibleTo: ['platform_admin', 'implementation_lead', 'tenant_operator'],
    },
  ],
  connectors: [
    {
      id: 'gmail-connector',
      name: 'Gmail Connector',
      source: 'Gmail OAuth / mailbox probe / draft tooling',
      scope: 'Inbound search, mailbox validation, draft generation',
      cadence: 'Manual or scheduled',
      outputs: ['message matches', 'draft links', 'quality triggers'],
      adminOwner: 'connector reliability pod',
      writeBack: 'Draft creation and compose URLs',
    },
    {
      id: 'drive-connector',
      name: 'Google Drive Connector',
      source: 'Drive API / folder tree / Sheets helpers',
      scope: 'File indexes, folder listings, Sheets writeback, template publishing',
      cadence: 'Manual or scheduled',
      outputs: ['folder maps', 'file indexes', 'published rows'],
      adminOwner: 'connector reliability pod',
      writeBack: 'Sheets updates and Drive bundle publishing',
    },
    {
      id: 'state-layer',
      name: 'Workspace + State Stores',
      source: 'enterprise_store + state_store',
      scope: 'Auth, memberships, leads, tasks, approvals, quality, receiving, metrics',
      cadence: 'Live app state',
      outputs: ['workspace rows', 'operating rows', 'agent runs'],
      adminOwner: 'deployment and security pod',
      writeBack: 'Primary app writes',
    },
  ],
  knowledgeGraph: [
    {
      id: 'tenant',
      name: 'Tenant',
      summary: 'A company or operating pod using the platform.',
      sourceOfTruth: 'enterprise_store',
      updatePattern: 'Session, workspace, and rollout events',
      feeds: ['platform admin', 'director command', 'tenant rollout'],
    },
    {
      id: 'document',
      name: 'Document',
      summary: 'A file or exported artifact that should become structured knowledge.',
      sourceOfTruth: 'Drive indexes + document intake',
      updatePattern: 'Upload, sync, and parsing events',
      feeds: ['document intelligence', 'knowledge runtime'],
    },
  ],
  dataEntrySurfaces: [
    {
      id: 'architect-entry',
      name: 'Tenant Blueprint Entry',
      users: ['implementation lead', 'platform admin'],
      route: '/app/architect',
      captures: ['sector', 'roles', 'data sources', 'starter module'],
      qualityRules: ['start with one module first', 'roles before automations', 'source map before agent writes'],
    },
  ],
  agentPods: [
    {
      id: 'connector-reliability',
      name: 'Connector Reliability Pod',
      purpose: 'Keeps Gmail, Drive, and file-change ingestion stable across tenants.',
      workspace: 'core-platform/connectors',
      leadRole: 'platform_admin',
      members: ['sync watcher', 'connector operator', 'failure triage agent'],
      readScope: ['connector accounts', 'sync health', 'source maps'],
      writeScope: ['retry jobs', 'sync cursors', 'connector status'],
      approvalGate: 'Any credential or scope change needs platform-admin approval.',
      automations: ['sync heartbeat', 'failure digest', 'stale-source alerts'],
    },
    {
      id: 'knowledge-graph',
      name: 'Knowledge Graph Pod',
      purpose: 'Turns documents, sheet rows, and messages into reusable business entities and relations.',
      workspace: 'core-platform/knowledge',
      leadRole: 'implementation_lead',
      members: ['document intelligence', 'entity extractor', 'provenance reviewer'],
      readScope: ['documents', 'chunks', 'message metadata', 'sheet indexes'],
      writeScope: ['canonical entities', 'relation proposals', 'source provenance'],
      approvalGate: 'Schema changes and writeback rules need implementation-lead approval.',
      automations: ['entity extraction', 'chunk refresh', 'relation repair'],
    },
  ],
  foundationSignals: [
    {
      id: 'workspace-app',
      name: 'Workspace Auth, Leads, Tasks, and Agent Runs',
      status: 'Live now',
      detail: 'The current workspace app already supports auth/session, public bootstrap, team members, lead pipeline, tasks, and agent runs.',
    },
    {
      id: 'gmail-runtime',
      name: 'Real Gmail Connector',
      status: 'Live now',
      detail: 'OAuth validation, mailbox probe, message search, and draft creation already exist in the backend.',
    },
    {
      id: 'drive-runtime',
      name: 'Real Drive Connector',
      status: 'Live now',
      detail: 'Drive folder listing, full file index, Sheets writeback, and bundle publishing are already implemented.',
    },
    {
      id: 'document-intake',
      name: 'Document and Metric Intake',
      status: 'Live now',
      detail: 'Files, text, PDFs, XLSX, JSON, and heuristic KPI extraction are already available.',
    },
    {
      id: 'knowledge-runtime-gap',
      name: 'Live Knowledge Graph Runtime',
      status: 'Needs wiring',
      detail: 'There is a separate knowledge-graph stack, but it is not connected to the current workspace app or tenant state.',
    },
  ],
  gaps: [
    {
      id: 'tenant-scope',
      name: 'Operational tables are not fully tenant-scoped',
      risk: 'Real multi-company CRM and ERP behavior breaks when state rows are not isolated by workspace.',
      nextMove: 'Move operational state into the enterprise model or add workspace scoping to every state table and API.',
    },
    {
      id: 'gmail-depth',
      name: 'Gmail ingest is still shallow',
      risk: 'The system cannot build durable CRM or quality context from full threads, attachments, and label history yet.',
      nextMove: 'Add thread and attachment ingest, incremental sync, and normalized Gmail tables.',
    },
    {
      id: 'drive-events',
      name: 'Drive sync is scan-based, not event-driven',
      risk: 'Folder changes and document revisions are easy to miss in a scaled tenant rollout.',
      nextMove: 'Add Drive Changes API, revision capture, ACL snapshots, and persistent file events.',
    },
    {
      id: 'canonical-knowledge',
      name: 'No canonical document, chunk, entity, and relation layer',
      risk: 'Agents can summarize files, but they cannot yet operate against a durable knowledge graph with provenance.',
      nextMove: 'Build tenant-scoped documents, chunks, observations, entities, relations, and retrieval policies.',
    },
    {
      id: 'security-granularity',
      name: 'Security is still coarse',
      risk: 'Enterprise tenants need source-level, connector-level, and field-level access boundaries.',
      nextMove: 'Introduce scoped roles, connector access rules, and sensitive-field policies in the live runtime.',
    },
  ],
  platformTeams: [
    {
      id: 'tenant-provisioning',
      name: 'Tenant Provisioning Pod',
      workspace: 'core-platform/provisioning',
      mission: 'Turns client blueprints into live tenants with the right modules, domains, and starter data.',
      scope: ['tenant setup', 'domain mapping', 'module templates'],
      successMetric: 'New client pods can go live without bespoke environment surgery.',
    },
    {
      id: 'deployment-security',
      name: 'Deployment and Security Pod',
      workspace: 'core-platform/security',
      mission: 'Owns role models, access rules, deployment posture, and runtime hardening.',
      scope: ['security zones', 'role templates', 'deployment posture'],
      successMetric: 'Tenant access and rollout controls stay predictable as the portfolio grows.',
    },
  ],
  rolloutPhases: [
    {
      id: 'phase-core',
      name: 'Stabilize the shared runtime',
      outcome: 'A tenant-scoped platform that can carry several companies safely.',
      modules: ['Platform Admin', 'Agent Ops', 'Solution Architect'],
      deliverables: ['tenant-scoped state', 'connector posture', 'role model'],
    },
    {
      id: 'phase-knowledge',
      name: 'Ship canonical knowledge',
      outcome: 'Documents and messages become reusable business context.',
      modules: ['Knowledge Runtime'],
      deliverables: ['document tables', 'entities and relations', 'retrieval + provenance'],
    },
  ],
}

export const YANGON_TYRE_MODEL: TenantOperatingModel = {
  id: 'yangon-tyre',
  tenantKey: 'ytf-plant-a',
  companyName: 'Yangon Tyre Plant A',
  publicLabel: 'Yangon Tyre',
  domain: 'ytf.supermega.dev',
  sector: 'manufacturing + distribution hybrid',
  thesis: 'A tenant-specific CRM, ERP, portal, and knowledge-graph system for tyre operations.',
  narrative:
    'Yangon Tyre should not be forced into a generic ERP shell. The stronger model is one tenant operating system where receiving, supplier control, quality, inventory, commercial CRM, and leadership review share the same memory, connector mesh, and agent runtime. Gmail, Drive, Sheets, ERP extracts, markdown notes, and human forms all feed canonical operating records.',
  paradigmShifts: [
    'From human-organized folders and trackers to canonical supplier, shipment, GRN, batch, and customer records.',
    'From reactive reporting to agent-managed exception queues and role-specific briefs.',
    'From one large ERP rollout to modular control layers that can expand safely over time.',
    'From dead documentation to a knowledge graph that feeds operators, managers, and AI agents together.',
  ],
  modules: [
    {
      id: 'receiving-control',
      name: 'Receiving Control',
      category: 'ERP',
      status: 'Live now',
      summary: 'The live inbound control desk for GRN gaps, shortages, holds, and next actions.',
      users: ['receiving clerk', 'plant manager', 'procurement lead'],
      route: '/app/receiving',
      dataFlows: ['GRN issue rows', 'hold events', 'supplier follow-up'],
      controls: ['owner tracking', 'exception visibility', 'handoff discipline'],
    },
    {
      id: 'plant-action-board',
      name: 'Plant Action Board',
      category: 'Control',
      status: 'Live now',
      summary: 'One shared queue for plant work, blockers, and shift follow-up.',
      users: ['plant manager', 'quality manager', 'receiving clerk'],
      route: '/app/actions',
      dataFlows: ['tasks', 'exceptions', 'shift notes'],
      controls: ['priority lane', 'due-date discipline', 'daily review'],
    },
    {
      id: 'supplier-control',
      name: 'Supplier Control',
      category: 'ERP',
      status: 'Rollout ready',
      summary: 'Supplier documents, discrepancies, approvals, and recovery loops in one vendor-facing system.',
      users: ['procurement lead', 'finance controller', 'plant manager'],
      route: '/app/approvals',
      dataFlows: ['PO records', 'invoice docs', 'shipment exceptions'],
      controls: ['evidence chase', 'delay escalation', 'vendor approvals'],
    },
    {
      id: 'quality-closeout',
      name: 'Quality Closeout',
      category: 'ERP',
      status: 'Rollout ready',
      summary: 'Incident, CAPA, hold, containment, and closeout discipline built around actual plant data.',
      users: ['quality manager', 'plant manager'],
      route: '/app/intake',
      dataFlows: ['incident reports', 'CAPA tasks', 'inspection evidence'],
      controls: ['root cause trail', 'closeout gates', 'quality review'],
    },
    {
      id: 'inventory-pulse',
      name: 'Inventory Pulse',
      category: 'ERP',
      status: 'Rollout ready',
      summary: 'Stock pressure, shortages, reorder risk, and slow-moving items attached to live operations.',
      users: ['plant manager', 'procurement lead', 'finance controller'],
      route: '/app/inventory',
      dataFlows: ['stock extracts', 'reorder thresholds', 'variance alerts'],
      controls: ['threshold watch', 'replenishment review', 'site comparison'],
    },
    {
      id: 'sales-crm',
      name: 'Sales CRM',
      category: 'CRM',
      status: 'Rollout ready',
      summary: 'Distributor, dealer, and account context connected to quotes, follow-up, and credit decisions.',
      users: ['sales lead', 'director', 'finance controller'],
      route: '/app/sales',
      dataFlows: ['dealer accounts', 'quote follow-up', 'credit and collection risk'],
      controls: ['account ownership', 'deal staging', 'commercial brief'],
    },
    {
      id: 'document-intelligence',
      name: 'Document Intelligence',
      category: 'Knowledge',
      status: 'Control layer',
      summary: 'Turns Gmail attachments, Drive folders, ERP exports, and uploaded files into structured operating records.',
      users: ['receiving clerk', 'quality manager', 'procurement lead'],
      route: '/app/documents',
      dataFlows: ['attachments', 'PO files', 'inspection docs', 'ERP exports'],
      controls: ['classification', 'field extraction', 'routing'],
    },
    {
      id: 'decision-journal',
      name: 'Decision Journal',
      category: 'Knowledge',
      status: 'Control layer',
      summary: 'Every supplier call, exception, approval, and management decision attached to source evidence.',
      users: ['director', 'finance controller', 'plant manager'],
      route: '/app/decisions',
      dataFlows: ['approvals', 'policy calls', 'exception outcomes'],
      controls: ['audit trail', 'manager rationale', 'repeat-pattern review'],
    },
    {
      id: 'knowledge-hub',
      name: 'Knowledge Hub and Markdown Vault',
      category: 'Knowledge',
      status: 'Next module',
      summary: 'A hybrid SOP, playbook, and Obsidian-style note layer that feeds operators and agents together.',
      users: ['quality manager', 'tenant admin', 'director'],
      dataFlows: ['SOPs', 'markdown notes', 'playbooks', 'learning loops'],
      controls: ['versioning', 'source links', 'role-specific publishing'],
    },
    {
      id: 'director-command-center',
      name: 'Director Command Center',
      category: 'Control',
      status: 'Control layer',
      summary: 'The executive review surface for revenue, plant risk, quality debt, and supplier exposure.',
      users: ['director', 'tenant admin'],
      route: '/app/director',
      dataFlows: ['briefs', 'exceptions', 'approvals', 'sales and inventory signals'],
      controls: ['escalation view', 'cross-module review', 'decision follow-through'],
    },
  ],
  roles: [
    {
      id: 'tenant_admin',
      name: 'Tenant Admin',
      summary: 'Owns module enablement, connector scopes, user roles, and runtime posture for Yangon Tyre.',
      defaultHome: '/app/platform-admin',
      capabilities: ['tenant_admin.view', 'security_admin.view', 'connector_admin.view', 'knowledge_admin.view'],
      securityZones: ['executive-control', 'shared-knowledge'],
      workspaces: ['ytf-admin', 'ytf-knowledge'],
    },
    {
      id: 'director',
      name: 'Director',
      summary: 'Reads the command center, reviews risk, and approves directional decisions.',
      defaultHome: '/app/director',
      capabilities: ['director.view', 'approvals.view', 'sales.view'],
      securityZones: ['executive-control', 'commercial-oversight'],
      workspaces: ['ytf-director'],
    },
    {
      id: 'plant_manager',
      name: 'Plant Manager',
      summary: 'Runs daily plant work, receiving risk, quality follow-up, and shift issues.',
      defaultHome: '/app/actions',
      capabilities: ['actions.view', 'receiving.view', 'approvals.view'],
      securityZones: ['plant-ops', 'quality-assurance'],
      workspaces: ['ytf-plant-ops'],
    },
    {
      id: 'procurement_lead',
      name: 'Procurement Lead',
      summary: 'Owns supplier records, PO follow-up, inbound discrepancies, and document chase.',
      defaultHome: '/app/approvals',
      capabilities: ['receiving.view', 'approvals.view', 'documents.view'],
      securityZones: ['procurement-finance', 'shared-knowledge'],
      workspaces: ['ytf-procurement'],
    },
    {
      id: 'receiving_clerk',
      name: 'Receiving Clerk',
      summary: 'Captures inbound exceptions, inspection context, and the next physical action.',
      defaultHome: '/app/receiving',
      capabilities: ['receiving.view', 'actions.view', 'documents.view'],
      securityZones: ['plant-ops'],
      workspaces: ['ytf-receiving'],
    },
    {
      id: 'quality_manager',
      name: 'Quality Manager',
      summary: 'Turns quality incidents and CAPA actions into structured closeout work.',
      defaultHome: '/app/intake',
      capabilities: ['actions.view', 'approvals.view', 'documents.view', 'knowledge_admin.view'],
      securityZones: ['quality-assurance', 'shared-knowledge'],
      workspaces: ['ytf-quality'],
    },
    {
      id: 'finance_controller',
      name: 'Finance Controller',
      summary: 'Reviews supplier exposure, approval thresholds, and commercial risk.',
      defaultHome: '/app/approvals',
      capabilities: ['approvals.view', 'director.view', 'sales.view'],
      securityZones: ['procurement-finance', 'executive-control'],
      workspaces: ['ytf-finance'],
    },
    {
      id: 'sales_lead',
      name: 'Sales Lead',
      summary: 'Owns dealer accounts, follow-up, and commercial exception context.',
      defaultHome: '/app/sales',
      capabilities: ['sales.view', 'actions.view', 'director.view'],
      securityZones: ['commercial-oversight'],
      workspaces: ['ytf-commercial'],
    },
  ],
  securityZones: [
    {
      id: 'executive-control',
      name: 'Executive Control',
      summary: 'Director brief, approval debt, financial exposure, and tenant posture.',
      controls: ['director access', 'sensitive approvals', 'cross-module review'],
      visibleTo: ['tenant_admin', 'director', 'finance_controller'],
    },
    {
      id: 'plant-ops',
      name: 'Plant Operations',
      summary: 'Receiving, shift follow-up, stock movement, and plant blockers.',
      controls: ['receiving edits', 'task ownership', 'shift issue visibility'],
      visibleTo: ['tenant_admin', 'plant_manager', 'receiving_clerk'],
    },
    {
      id: 'procurement-finance',
      name: 'Procurement and Finance',
      summary: 'Supplier records, PO evidence, invoices, and approval thresholds.',
      controls: ['document access', 'supplier approvals', 'commercial exposure'],
      visibleTo: ['tenant_admin', 'procurement_lead', 'finance_controller'],
    },
    {
      id: 'quality-assurance',
      name: 'Quality Assurance',
      summary: 'Incidents, CAPA, holds, and containment actions.',
      controls: ['incident history', 'closeout evidence', 'quality signoff'],
      visibleTo: ['tenant_admin', 'quality_manager', 'plant_manager'],
    },
    {
      id: 'commercial-oversight',
      name: 'Commercial Oversight',
      summary: 'Dealer CRM, quote follow-up, credit risk, and revenue movement.',
      controls: ['account ownership', 'deal access', 'director review'],
      visibleTo: ['tenant_admin', 'sales_lead', 'director', 'finance_controller'],
    },
    {
      id: 'shared-knowledge',
      name: 'Shared Knowledge',
      summary: 'Playbooks, markdown notes, SOPs, and extracted business memory.',
      controls: ['knowledge publishing', 'source provenance', 'vault sync'],
      visibleTo: ['tenant_admin', 'quality_manager', 'procurement_lead', 'director'],
    },
  ],
  connectors: [
    {
      id: 'gmail-sales',
      name: 'Sales Gmail',
      source: 'Gmail inbox for dealer and quote communication',
      scope: 'Dealer threads, quote requests, overdue follow-up',
      cadence: '15-minute sync target',
      outputs: ['account timeline', 'follow-up tasks', 'commercial brief'],
      adminOwner: 'tenant admin',
      writeBack: 'Draft replies, follow-up notes, and linked account updates',
    },
    {
      id: 'gmail-procurement',
      name: 'Procurement Gmail',
      source: 'Gmail inbox for supplier communication and missing documents',
      scope: 'Supplier chases, customs or PO evidence, discrepancy follow-up',
      cadence: '15-minute sync target',
      outputs: ['supplier tasks', 'document requests', 'approval records'],
      adminOwner: 'tenant admin',
      writeBack: 'Draft reminders and supplier status updates',
    },
    {
      id: 'drive-ops',
      name: 'Plant Google Drive',
      source: 'Drive folders, shared drives, and Sheets trackers',
      scope: 'Receiving folders, quality docs, finance sheets, shift trackers',
      cadence: 'Hourly scan until event sync is wired',
      outputs: ['document indexes', 'sheet snapshots', 'knowledge candidates'],
      adminOwner: 'tenant admin',
      writeBack: 'Published sheets, file bundles, and shared reports',
    },
    {
      id: 'erp-extracts',
      name: 'ERP and Export Feed',
      source: 'ERP extracts, CSV uploads, and scheduled snapshots',
      scope: 'PO, GRN, stock, invoice, and branch movement data',
      cadence: 'Daily or intraday batch',
      outputs: ['inventory signals', 'variance watch', 'supplier exposure'],
      adminOwner: 'tenant admin',
      writeBack: 'Controlled import rows and reconciliation views',
    },
    {
      id: 'markdown-vault',
      name: 'Obsidian or Markdown Vault',
      source: 'Operational notes, root-cause writeups, SOP markdown, and meeting notes',
      scope: 'Manager notes, quality reasoning, playbooks, and operating decisions',
      cadence: 'On save or scheduled sync',
      outputs: ['knowledge articles', 'decision context', 'agent memory prompts'],
      adminOwner: 'quality manager',
      writeBack: 'Versioned notes and linked operating memory',
    },
    {
      id: 'human-entry',
      name: 'Structured Human Entry',
      source: 'Forms, Sheets, intake lanes, and mobile-ready entry screens',
      scope: 'Receiving inspection, CAPA actions, supplier exceptions, account reviews',
      cadence: 'Live entry',
      outputs: ['clean records', 'quality history', 'operator-ready tasks'],
      adminOwner: 'plant manager',
      writeBack: 'Primary record creation',
    },
  ],
  knowledgeGraph: [
    {
      id: 'supplier',
      name: 'Supplier',
      summary: 'A vendor relationship with documents, delays, exceptions, and approvals attached.',
      sourceOfTruth: 'procurement Gmail + Drive + ERP extracts',
      updatePattern: 'Thread updates, document sync, ERP snapshots',
      feeds: ['Supplier Control', 'Director Command Center'],
    },
    {
      id: 'shipment',
      name: 'Shipment',
      summary: 'An inbound delivery with expected vs received state and discrepancy history.',
      sourceOfTruth: 'ERP extracts + receiving entry',
      updatePattern: 'Inbound updates and receiving exceptions',
      feeds: ['Receiving Control', 'Inventory Pulse'],
    },
    {
      id: 'grn',
      name: 'GRN and Receipt',
      summary: 'The receipt event tying shipment, quantities, holds, and variance together.',
      sourceOfTruth: 'Receiving Control',
      updatePattern: 'Live operator entry and reconciliation',
      feeds: ['Receiving Control', 'Supplier Control', 'Director Command Center'],
    },
    {
      id: 'batch',
      name: 'Batch and Lot',
      summary: 'Product batch history used for quality, containment, and stock reasoning.',
      sourceOfTruth: 'ERP extracts + quality closeout',
      updatePattern: 'Quality incidents and stock updates',
      feeds: ['Quality Closeout', 'Inventory Pulse'],
    },
    {
      id: 'quality_incident',
      name: 'Quality Incident and CAPA',
      summary: 'A quality event linked to batch, supplier, containment, and closeout.',
      sourceOfTruth: 'Quality Closeout + Gmail quality matches',
      updatePattern: 'Incident intake, evidence uploads, and manager signoff',
      feeds: ['Quality Closeout', 'Director Command Center', 'Knowledge Hub and Markdown Vault'],
    },
    {
      id: 'account',
      name: 'Dealer and Account',
      summary: 'Commercial account history linked to quotes, follow-up, and credit exposure.',
      sourceOfTruth: 'Sales CRM + Gmail sales sync',
      updatePattern: 'Account review, email activity, and sales updates',
      feeds: ['Sales CRM', 'Director Command Center'],
    },
    {
      id: 'decision',
      name: 'Decision',
      summary: 'A tracked management or approval choice connected to source evidence.',
      sourceOfTruth: 'Decision Journal',
      updatePattern: 'Approval changes and director review',
      feeds: ['Decision Journal', 'Director Command Center', 'Knowledge Hub and Markdown Vault'],
    },
    {
      id: 'metric',
      name: 'Operational Metric',
      summary: 'Threshold-bearing KPI rows tied back to source data and owners.',
      sourceOfTruth: 'Metric intake + ERP extracts',
      updatePattern: 'Scheduled imports and operator correction',
      feeds: ['Director Command Center', 'Inventory Pulse', 'Quality Closeout'],
    },
  ],
  dataEntrySurfaces: [
    {
      id: 'receiving-inspection',
      name: 'Receiving Inspection Entry',
      users: ['receiving clerk', 'plant manager'],
      route: '/app/receiving',
      captures: ['GRN mismatch', 'hold reason', 'supplier note', 'photo or doc reference'],
      qualityRules: ['one receipt record per issue', 'required owner', 'required next action'],
    },
    {
      id: 'quality-closeout-entry',
      name: 'Quality Incident and CAPA Entry',
      users: ['quality manager', 'plant manager'],
      route: '/app/intake',
      captures: ['incident summary', 'batch or lot', 'containment action', 'CAPA owner', 'closeout evidence'],
      qualityRules: ['root cause before closeout', 'evidence attached', 'manager signoff required'],
    },
    {
      id: 'supplier-recovery-entry',
      name: 'Supplier Discrepancy and Recovery Entry',
      users: ['procurement lead', 'finance controller'],
      route: '/app/approvals',
      captures: ['supplier record', 'missing evidence', 'financial impact', 'required reply'],
      qualityRules: ['discrepancy tied to shipment or PO', 'approval threshold applied', 'age tracked'],
    },
    {
      id: 'account-review-entry',
      name: 'Dealer Account Review',
      users: ['sales lead', 'director'],
      route: '/app/sales',
      captures: ['account stage', 'credit notes', 'next visit', 'commercial risk'],
      qualityRules: ['account owner required', 'next action required', 'risk label reviewed weekly'],
    },
    {
      id: 'director-exception-note',
      name: 'Director Exception Note',
      users: ['director', 'tenant admin'],
      route: '/app/director',
      captures: ['exception decision', 'priority shift', 'cross-module note'],
      qualityRules: ['linked to source records', 'owner and due date required'],
    },
  ],
  agentPods: [
    {
      id: 'intake-router',
      name: 'Intake Router Pod',
      purpose: 'Classifies inbound emails, files, and manual submissions into the right module and owner.',
      workspace: 'ytf/inbox-router',
      leadRole: 'tenant_admin',
      members: ['document classifier', 'task triage agent', 'operator reviewer'],
      readScope: ['Gmail metadata', 'Drive indexes', 'manual intake rows'],
      writeScope: ['draft tasks', 'document classifications', 'owner suggestions'],
      approvalGate: 'Human review before cross-module writes or external communication.',
      automations: ['mailbox scan', 'folder scan', 'task suggestion', 'stale intake alerts'],
    },
    {
      id: 'supplier-recovery',
      name: 'Supplier Recovery Pod',
      purpose: 'Tracks missing documents, delayed supplier responses, and unresolved discrepancies.',
      workspace: 'ytf/procurement',
      leadRole: 'procurement_lead',
      members: ['supplier watch', 'evidence chaser', 'approval watch'],
      readScope: ['supplier records', 'PO files', 'Gmail procurement threads', 'approval history'],
      writeScope: ['draft follow-up', 'document request tasks', 'escalation proposals'],
      approvalGate: 'Escalations affecting finance or supplier scorecards need procurement-lead approval.',
      automations: ['missing-doc sweep', 'delay ranking', 'supplier digest'],
    },
    {
      id: 'quality-watch',
      name: 'Quality Watch Pod',
      purpose: 'Turns quality signals from mail, files, and forms into incident and CAPA starters.',
      workspace: 'ytf/quality',
      leadRole: 'quality_manager',
      members: ['incident extractor', 'capa drafter', 'knowledge writer'],
      readScope: ['quality Gmail matches', 'Drive quality docs', 'incident forms', 'batch records'],
      writeScope: ['incident drafts', 'CAPA starter tasks', 'knowledge suggestions'],
      approvalGate: 'Quality manager approves any incident classification that affects customer or supplier status.',
      automations: ['incident match', 'CAPA prep', 'stale closeout alerts'],
    },
    {
      id: 'commercial-memory',
      name: 'Commercial Memory Pod',
      purpose: 'Keeps dealer accounts, quotes, and follow-up history consistent across Gmail and CRM.',
      workspace: 'ytf/commercial',
      leadRole: 'sales_lead',
      members: ['revenue scout', 'account clerk', 'follow-up orchestrator'],
      readScope: ['dealer records', 'sales Gmail', 'quote sheets', 'account notes'],
      writeScope: ['account updates', 'follow-up drafts', 'risk tags'],
      approvalGate: 'Credit-sensitive changes need finance-controller review.',
      automations: ['follow-up refresh', 'account enrichment', 'revenue-risk brief'],
    },
    {
      id: 'director-brief',
      name: 'Director Brief Pod',
      purpose: 'Builds a short executive review from plant, supplier, quality, and commercial state.',
      workspace: 'ytf/director',
      leadRole: 'director',
      members: ['brief compiler', 'risk ranker', 'decision journal watcher'],
      readScope: ['exceptions', 'approvals', 'inventory risk', 'sales risk', 'decision history'],
      writeScope: ['daily brief drafts', 'escalation queues', 'decision prompts'],
      approvalGate: 'Director or tenant admin reviews outward-facing summaries and high-severity escalations.',
      automations: ['daily brief', 'weekend review', 'stale decision watch'],
    },
  ],
  foundationSignals: [
    {
      id: 'receiving-live',
      name: 'Receiving and action surfaces already exist',
      status: 'Live now',
      detail: 'Receiving Control, Action Board, Decision Journal, Director, Agent Ops, and inventory surfaces already exist in the app.',
    },
    {
      id: 'google-inputs',
      name: 'Google and document connectors already exist',
      status: 'Live now',
      detail: 'Gmail, Drive, Sheets, file indexing, document intake, and metric intake are already available in the codebase.',
    },
    {
      id: 'tenant-blueprint',
      name: 'Tenant operating model now defined',
      status: 'Live now',
      detail: 'Yangon Tyre now has explicit modules, roles, zones, connectors, data-entry surfaces, and agent pods in the showroom app.',
    },
  ],
  gaps: [
    {
      id: 'ytf-tenant-scope',
      name: 'Tenant-scoped knowledge and state need deeper backend wiring',
      risk: 'Yangon Tyre can be demoed now, but canonical knowledge records still need live backend persistence across modules.',
      nextMove: 'Extend the enterprise store and state store so YTF entities and relations become first-class runtime objects.',
    },
    {
      id: 'ytf-drive-events',
      name: 'Drive and Gmail need deeper incremental sync for production automation',
      risk: 'Folder or thread changes can still be missed between scans when activity increases.',
      nextMove: 'Add event cursors, attachment ingest, revision tracking, and source-level provenance.',
    },
    {
      id: 'ytf-field-security',
      name: 'Field-level access rules are still missing',
      risk: 'Commercial, finance, and supplier-sensitive records need tighter boundaries than broad role strings.',
      nextMove: 'Add sensitive-field policy templates and per-source scopes before autonomous writes expand.',
    },
  ],
  platformTeams: [
    {
      id: 'ytf-rollout',
      name: 'Yangon Tyre Rollout Pod',
      workspace: 'client/ytf-rollout',
      mission: 'Moves Yangon Tyre from receiving-first rollout to a full tenant operating system.',
      scope: ['module rollout', 'user enablement', 'connector setup'],
      successMetric: 'Plant and director teams adopt one system without duplicating work in side trackers.',
    },
  ],
  rolloutPhases: [
    {
      id: 'phase-1',
      name: 'Phase 1: Stabilize plant intake and exception control',
      outcome: 'One trusted receiving and action layer for Plant A.',
      modules: ['Receiving Control', 'Plant Action Board', 'Director Command Center'],
      deliverables: ['receiving entry discipline', 'daily manager review', 'director exception brief'],
    },
    {
      id: 'phase-2',
      name: 'Phase 2: Connect supplier, quality, and inventory loops',
      outcome: 'Operational risk and follow-up move from email chasing into controlled modules.',
      modules: ['Supplier Control', 'Quality Closeout', 'Inventory Pulse', 'Document Intelligence'],
      deliverables: ['supplier evidence chase', 'CAPA closeout flow', 'stock-pressure watch'],
    },
    {
      id: 'phase-3',
      name: 'Phase 3: Open the commercial and portal layer',
      outcome: 'Dealer CRM, account memory, and director revenue view join the same tenant graph.',
      modules: ['Sales CRM', 'Decision Journal', 'Knowledge Hub and Markdown Vault'],
      deliverables: ['dealer memory', 'commercial brief', 'markdown-to-knowledge sync'],
    },
    {
      id: 'phase-4',
      name: 'Phase 4: Deepen autonomous knowledge loops',
      outcome: 'Agents can keep records fresh, route work, and maintain tenant memory continuously.',
      modules: ['Document Intelligence', 'Knowledge Hub and Markdown Vault', 'Director Command Center'],
      deliverables: ['entity extraction', 'relation upkeep', 'proactive control-room briefs'],
    },
  ],
}

export const OPERATING_MODELS = [SUPERMEGA_CORE_MODEL, YANGON_TYRE_MODEL] as const

export function getTenantOperatingModel(tenantKey: TenantOperatingModel['tenantKey']) {
  return tenantKey === 'ytf-plant-a' ? YANGON_TYRE_MODEL : SUPERMEGA_CORE_MODEL
}

export function getOperatingModelById(id: TenantOperatingModel['id']) {
  return OPERATING_MODELS.find((item) => item.id === id) ?? SUPERMEGA_CORE_MODEL
}
