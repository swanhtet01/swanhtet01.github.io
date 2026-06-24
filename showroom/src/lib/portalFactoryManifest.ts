import {
  PORTAL_SHELL_MODULES,
  SHARED_PORTAL_MODULES,
  getPortalModuleStandardTags,
  getPortalModuleValueMetric,
  type IndustryPortalKit,
  type PortalModuleBlueprint,
} from './industryPortalKits'
import { getModuleContractsForPortal, type PortalModuleContract } from './portalModuleContracts'

export type PortalFactoryManifestModule = {
  id: string
  name: string
  layer: 'Shell' | 'Shared' | 'Industry'
  route: string
  staticExportPath: string
  capability: string
  ownerRole: string
  workspace: string
  launchMode: 'Kernel' | 'Always' | PortalModuleBlueprint['launchMode']
  maturity: 'Kernel' | 'Shared' | PortalModuleContract['maturity']
  kpi: string
  inputs: string[]
  outputs: string[]
  standards: string[]
  sourceTruth: string[]
  agentSpec: {
    runtime: string
    allowedTools: string[]
    job: string
    reviewGate: string
    evals: string[]
    toolPolicy: {
      authorityOrder: string[]
      actionClass: 'Perceive' | 'Reason' | 'Act - staged'
      privacyFlow: string[]
      autonomyGate: string
      rollback: string
    }
  }
  seedData: string[]
  launchChecks: string[]
}

export type PortalFactoryWorkcellBlueprint = {
  id: string
  moduleId: string
  name: string
  route: string
  trigger: string
  sourceScope: string[]
  allowedTools: string[]
  outputSchema: string[]
  evals: string[]
  humanGate: string
  autonomyGate: string
  riskClass: 'perceive' | 'reason' | 'staged_action'
}

export type PortalFactoryBuildPacket = {
  packageName: string
  firstWorkflow: string
  buyer: string
  roles: string[]
  sourcePlan: string[]
  routes: string[]
  workcells: Array<{
    id: string
    name: string
    route: string
    gate: string
  }>
  qaGates: string[]
  salesPromise: string
}

export type PortalFactoryManifest = {
  id: string
  kitId: string
  name: string
  industry: string
  buyer: string
  domainPattern: string
  demoLogin: string
  roles: string[]
  dataPlugs: string[]
  capabilities: string[]
  appRoutes: string[]
  staticExportPaths: string[]
  modules: PortalFactoryManifestModule[]
  workcellBlueprints: PortalFactoryWorkcellBlueprint[]
  buildPacket: PortalFactoryBuildPacket
  sourcePlugPlan: string[]
  seedDataRequirements: string[]
  launchChecklist: string[]
  routeCoverage: {
    totalModules: number
    routedModules: number
    missingRoutes: string[]
  }
}

const ROUTE_CAPABILITY_HINTS: Record<string, string> = {
  '/app/actions': 'actions.view',
  '/app/approvals': 'approvals.view',
  '/app/connectors': 'connector_admin.view',
  '/app/data-fabric': 'agent_ops.view',
  '/app/daily-brief': 'director.view',
  '/app/director': 'director.view',
  '/app/dqms': 'dqms.view',
  '/app/factory': 'architect.view',
  '/app/insights': 'director.view',
  '/app/maintenance': 'maintenance.view',
  '/app/operations': 'operations.view',
  '/app/plant-manager': 'operations.view',
  '/app/plant-os': 'operations.view',
  '/app/industrial-os': 'operations.view',
  '/app/platform-admin': 'tenant_admin.view',
  '/app/portal-factory': 'architect.view',
  '/app/receiving': 'receiving.view',
  '/app/restaurant-os': 'operations.view',
  '/app/simple-tools': 'actions.view',
  '/app/start': 'actions.view',
}

const BLUEPRINT_ROUTE_HINTS: Record<string, string> = {
  'industrial-operations-command': '/app/operations',
  'industrial-quality-traceability-capa': '/app/dqms',
  'industrial-asset-reliability': '/app/maintenance',
  'industrial-supplier-receiving-control': '/app/receiving',
  'industrial-executive-decision-brief': '/app/daily-brief',
  'industrial-energy-utility-watch': '/app/insights',
  'industrial-ot-safety-risk': '/app/actions',
  'industrial-factory-knowledge-graph': '/app/data-fabric',
  'restaurant-shift-board': '/app/restaurant-os',
  'restaurant-stock-prep': '/app/restaurant-os',
  'restaurant-guest-recovery': '/app/restaurant-os',
  'restaurant-supplier-discrepancy': '/app/restaurant-os',
  'restaurant-promo-lift': '/app/restaurant-os',
  'restaurant-qr-menu-transition': '/app/restaurant-os',
  'restaurant-pos-payment': '/app/restaurant-os',
  'restaurant-pos-payment-control': '/app/restaurant-os',
  'service-client-crm': '/app/service-desk',
  'service-delivery-queue': '/app/service-desk',
  'service-meeting-action-tracker': '/app/actions',
  'service-proposal-builder': '/app/factory',
  'service-billing-readiness': '/app/approvals',
}

function getPortalKind(kit: IndustryPortalKit): PortalModuleContract['portal'] {
  if (kit.id.includes('restaurant')) return 'restaurant'
  if (kit.id.includes('service')) return 'service'
  return 'industrial'
}

function toStaticExportPath(route: string) {
  return route.replace(/^\/+/, '').replace(/\/+$/, '') || 'index'
}

function routeCapability(route: string, workspace?: string) {
  return ROUTE_CAPABILITY_HINTS[route] ?? (workspace === 'Director' ? 'director.view' : workspace === 'Builder' ? 'architect.view' : 'operations.view')
}

function findBestContract(blueprint: PortalModuleBlueprint, contracts: PortalModuleContract[]) {
  const haystack = `${blueprint.id} ${blueprint.name}`.toLowerCase()
  return (
    contracts.find((contract) => haystack.includes(contract.name.toLowerCase().split(' ')[0])) ??
    contracts.find((contract) => contract.name.toLowerCase().includes(blueprint.name.toLowerCase().split(' ')[0])) ??
    null
  )
}

function resolveBlueprintRoute(blueprint: PortalModuleBlueprint, contract: PortalModuleContract | null) {
  return BLUEPRINT_ROUTE_HINTS[blueprint.id] ?? contract?.route ?? '/app/start'
}

function buildIndustryModule(blueprint: PortalModuleBlueprint, contracts: PortalModuleContract[], dataPlugs: string[]): PortalFactoryManifestModule {
  const contract = findBestContract(blueprint, contracts)
  const route = resolveBlueprintRoute(blueprint, contract)
  const sourceTruth = contract?.sourceTruth ?? blueprint.inputs
  const kpi = contract?.kpi ?? getPortalModuleValueMetric(blueprint)
  return {
    id: blueprint.id,
    name: blueprint.name,
    layer: 'Industry',
    route,
    staticExportPath: toStaticExportPath(route),
    capability: routeCapability(route, blueprint.workspace),
    ownerRole: blueprint.primaryRole,
    workspace: blueprint.workspace,
    launchMode: blueprint.launchMode,
    maturity: contract?.maturity ?? (blueprint.launchMode === 'Day 1' ? 'Sellable module' : 'Next build'),
    kpi,
    inputs: blueprint.inputs,
    outputs: blueprint.outputs,
    standards: getPortalModuleStandardTags(blueprint),
    sourceTruth,
    agentSpec: {
      runtime: blueprint.workspace === 'Builder' ? 'LlamaIndex + OpenAI Agents SDK' : 'OpenAI Agents SDK + Vercel AI SDK',
      allowedTools: Array.from(new Set([...dataPlugs.slice(0, 4), ...sourceTruth.slice(0, 3), 'Evidence ledger'])),
      job: blueprint.agentAssist,
      reviewGate: contract?.reviewGate ?? `${blueprint.primaryRole} approves AI output before writeback.`,
      evals: [
        'source cited',
        'owner named',
        'missing evidence flagged',
        'human review required',
        'tool scope preserved',
        'security drill mapped',
        'privacy-flow recorded',
        'rollback path named',
      ],
      toolPolicy: {
        authorityOrder: ['Tenant owner', blueprint.primaryRole, 'Data owner', 'Requester', 'Agent'],
        actionClass: blueprint.launchMode === 'Adaptive' ? 'Reason' : 'Act - staged',
        privacyFlow: ['user request', 'source retrieval', 'tool call', 'tool response', 'draft output', 'review queue', 'approved writeback'],
        autonomyGate: 'Action tools dry-run first and require human approval before changing business records.',
        rollback: 'Every writeback references the prior state, reviewer, timestamp, and undo note.',
      },
    },
    seedData: blueprint.inputs.slice(0, 4),
    launchChecks: [
      `Route opens: ${route}`,
      `Capability registered: ${routeCapability(route, blueprint.workspace)}`,
      'Sample record exists',
      'Agent output is staged with evidence',
      'Unsafe tool/writeback attempt is staged or blocked',
      'Mobile capture path checked',
    ],
  }
}

function buildShellModules(): PortalFactoryManifestModule[] {
  const shellRoutes: Record<string, string> = {
    'login-access': '/login',
    'workspace-shell': '/app/start',
    'module-launcher': '/app/start',
    'connector-hub': '/app/connectors',
    'evidence-ledger': '/app/data-fabric',
    'agent-control-plane': '/app/teams',
    'meta-tools': '/app/portal-factory',
    'notification-command': '/app/actions',
  }

  return PORTAL_SHELL_MODULES.map((module) => {
    const route = shellRoutes[module.id] ?? '/app/start'
    return {
      id: module.id,
      name: module.plainName,
      layer: 'Shell',
      route,
      staticExportPath: toStaticExportPath(route),
      capability: route.startsWith('/app') ? routeCapability(route) : 'public.auth',
      ownerRole: module.owner,
      workspace: 'Kernel',
      launchMode: 'Kernel',
      maturity: 'Kernel',
      kpi: module.firstUse,
      inputs: module.mustHave,
      outputs: [module.firstUse],
      standards: module.standards,
      sourceTruth: module.mustHave,
      agentSpec: {
        runtime: 'Vercel app shell + access policy',
        allowedTools: ['session', 'role registry', 'audit log'],
        job: 'Keep the portal safe, simple, and role-aware before industry workflows run.',
        reviewGate: 'Tenant or platform admin approves shell configuration changes.',
        evals: ['login works', 'role visibility correct', 'audit trail present', 'session cannot cross tenant'],
        toolPolicy: {
          authorityOrder: ['Platform admin', 'Tenant admin', module.owner, 'User session'],
          actionClass: 'Perceive',
          privacyFlow: ['login request', 'workspace resolution', 'role resolution', 'allowed route', 'audit row'],
          autonomyGate: 'No autonomous shell, credential, or role changes.',
          rollback: 'Configuration changes keep previous role/module policy for restore.',
        },
      },
      seedData: module.mustHave.slice(0, 3),
      launchChecks: ['Login path works', 'Role session works', 'Direct route opens', 'Mobile app shell checked'],
    }
  })
}

function buildSharedModules(): PortalFactoryManifestModule[] {
  const sharedRoutes: Record<string, string> = {
    'role-home': '/app/start',
    'work-inbox': '/app/actions',
    'client-room': '/app/client-room',
    'document-control': '/app/documents',
    'approval-decision-log': '/app/approvals',
    'kpi-review': '/app/insights',
    'agent-workbench': '/app/agent-workbench',
    'data-quality': '/app/data-fabric',
  }

  return SHARED_PORTAL_MODULES.map((module) => {
    const route = sharedRoutes[module.id] ?? '/app/start'
    return {
      id: module.id,
      name: module.plainName,
      layer: 'Shared',
      route,
      staticExportPath: toStaticExportPath(route),
      capability: routeCapability(route),
      ownerRole: module.users[0] ?? 'Manager',
      workspace: 'Shared',
      launchMode: 'Always',
      maturity: 'Shared',
      kpi: module.kpi,
      inputs: module.inputs,
      outputs: module.outputs,
      standards: module.standards,
      sourceTruth: module.inputs,
      agentSpec: {
        runtime: 'OpenAI Agents SDK + evidence ledger',
        allowedTools: ['module data', 'source ledger', 'task queue'],
        job: module.agentLoop,
        reviewGate: module.launchRule,
        evals: ['source cited', 'output owner set', 'review state visible', 'memory writes reviewed', 'tool allowlist enforced', 'privacy-flow recorded'],
        toolPolicy: {
          authorityOrder: ['Tenant admin', module.users[0] ?? 'Process owner', 'Data owner', 'Requester', 'Agent'],
          actionClass: 'Act - staged',
          privacyFlow: ['request', 'source ledger read', 'tool call', 'agent draft', 'review state', 'approved action'],
          autonomyGate: 'Shared modules can create drafts and queue items; external writes require approval.',
          rollback: 'Queue and approval records keep previous value, reviewer, and rollback note.',
        },
      },
      seedData: module.inputs.slice(0, 3),
      launchChecks: [`Route opens: ${route}`, 'Sample queue item exists', 'Agent run is reviewable'],
    }
  })
}

function buildWorkcellBlueprint(module: PortalFactoryManifestModule): PortalFactoryWorkcellBlueprint {
  const riskClass =
    module.agentSpec.toolPolicy.actionClass === 'Perceive'
      ? 'perceive'
      : module.agentSpec.toolPolicy.actionClass === 'Reason'
        ? 'reason'
        : 'staged_action'

  return {
    id: `${module.id}-workcell`,
    moduleId: module.id,
    name: `${module.name} Workcell`,
    route: module.route,
    trigger: module.inputs[0] || module.kpi || 'New source-backed exception',
    sourceScope: Array.from(new Set([...module.sourceTruth, ...module.inputs])).slice(0, 6),
    allowedTools: module.agentSpec.allowedTools,
    outputSchema: [
      'source_scope',
      'evidence_links',
      'draft_output',
      'missing_evidence',
      'recommended_owner',
      'review_state',
      'rollback_note',
    ],
    evals: module.agentSpec.evals,
    humanGate: module.agentSpec.reviewGate,
    autonomyGate: module.agentSpec.toolPolicy.autonomyGate,
    riskClass,
  }
}

export function buildPortalFactoryManifest(kit: IndustryPortalKit): PortalFactoryManifest {
  const contracts = getModuleContractsForPortal(getPortalKind(kit))
  const industryModules = kit.moduleBlueprints.map((blueprint) => buildIndustryModule(blueprint, contracts, kit.dataPlugs))
  const modules = [...buildShellModules(), ...buildSharedModules(), ...industryModules]
  const appRoutes = Array.from(new Set(modules.map((module) => module.route).filter((route) => route.startsWith('/app')))).sort()
  const staticExportPaths = Array.from(new Set(modules.map((module) => module.staticExportPath))).sort()
  const capabilities = Array.from(new Set(modules.map((module) => module.capability))).sort()
  const missingRoutes = modules.filter((module) => module.route === '/app/start' && module.layer === 'Industry').map((module) => module.name)
  const workcellBlueprints = industryModules.map(buildWorkcellBlueprint)
  const firstDayModule = industryModules.find((module) => module.launchMode === 'Day 1') ?? industryModules[0]
  const buildPacket: PortalFactoryBuildPacket = {
    packageName: kit.name,
    firstWorkflow: firstDayModule?.name ?? 'First client workflow',
    buyer: kit.buyer,
    roles: kit.roles.slice(0, 8),
    sourcePlan: Array.from(new Set([...kit.dataPlugs, ...(firstDayModule?.sourceTruth ?? [])])).slice(0, 8),
    routes: appRoutes.slice(0, 10),
    workcells: workcellBlueprints.slice(0, 5).map((workcell) => ({
      id: workcell.id,
      name: workcell.name,
      route: workcell.route,
      gate: workcell.humanGate,
    })),
    qaGates: [
      'Authenticated demo reaches the right role home.',
      'First workflow creates or stages one useful operating record.',
      'Every AI output shows source scope, missing evidence, and reviewer.',
      'Mobile capture and desktop review both work.',
      'Route, domain, and protected API smoke checks pass.',
    ],
    salesPromise: `${kit.name} ships as a role-based portal with one first workflow, source-backed workcells, and release evidence before custom expansion.`,
  }

  return {
    id: `${kit.id}-manifest`,
    kitId: kit.id,
    name: `${kit.name} manifest`,
    industry: kit.industry,
    buyer: kit.buyer,
    domainPattern: kit.id === 'industrial-plant-os' ? 'dedicated client host only' : 'client.supermega.dev',
    demoLogin: 'owner / one-click app demo',
    roles: kit.roles,
    dataPlugs: kit.dataPlugs,
    capabilities,
    appRoutes,
    staticExportPaths,
    modules,
    workcellBlueprints,
    buildPacket,
    sourcePlugPlan: kit.dataPlugs.map((plug) => `${plug}: connect, classify, extract, stage, review, and monitor freshness.`),
    seedDataRequirements: Array.from(new Set(modules.flatMap((module) => module.seedData))).slice(0, 18),
    launchChecklist: [
      'Preview account works and lands on the correct role home.',
      'Every enabled module has route, capability, sample record, KPI, and review gate.',
      'Every AI output shows source scope, freshness, owner, and staged writeback state.',
      'Every action tool declares risk tier, action class, privacy-flow, dry-run behavior, approval owner, and rollback note.',
      'Recursive agent workcells declare roles, iteration cap, handoff schema, and human approval.',
      'Agent security drills cover goal hijack, tool misuse, memory poisoning, and unsafe delegation.',
      'Direct static routes are exported for every app route in the manifest.',
      'Mobile capture and desktop review both complete the first workflow.',
      'Go-live checker passes for deployment URL and custom aliases.',
    ],
    routeCoverage: {
      totalModules: modules.length,
      routedModules: modules.length - missingRoutes.length,
      missingRoutes,
    },
  }
}
