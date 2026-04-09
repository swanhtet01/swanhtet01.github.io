export type SolutionPriority =
  | 'actions'
  | 'follow_up'
  | 'director_visibility'
  | 'supplier'
  | 'receiving'
  | 'inventory'
  | 'quality'
  | 'cash'
  | 'sales'
  | 'production'
  | 'attendance'

export type SolutionArchitectRequest = {
  company_name: string
  sector: 'factory' | 'distribution' | 'services' | 'mixed'
  team_size: number
  site_count: number
  priorities: SolutionPriority[]
  current_tools: string[]
  data_sources: string[]
  pain_points: string
}

export type SolutionBlueprint = {
  company_name: string
  sector: string
  team_size: number
  site_count: number
  service_packs: string[]
  primary_pack: string
  wedge_product: string
  flagship: string
  recommended_modules: Array<{ name: string; reason: string }>
  semi_products: Array<{ name: string; reason: string }>
  free_tools: Array<{ name: string; reason: string }>
  agent_teams: Array<{ name: string; role: string }>
  implementation_order: string[]
  current_stack: string[]
  next_stack: string[]
  ux_surfaces: string[]
  value_prop: string
  first_30_days: string[]
  notes: string[]
  risks: string[]
}

const MODULE_REASONS: Record<string, string> = {
  'Action OS': 'Creates one shared owner and due-date layer before adding deeper ERP logic.',
  'Supplier Watch': 'Flags delay, customs, documentation, and supplier-payment risk before they hit operations.',
  'Receiving Control': 'Turns inbound receipt, variance, and hold status into one working control board.',
  'Inventory Pulse': 'Shows available stock, reorder pressure, and warehouse risk without waiting for a full ERP rollout.',
  'Quality Closeout': 'Moves incidents from report-only into containment, CAPA, and closeout discipline.',
  'Cash Watch': 'Puts overdue, promised payment, and follow-up into one finance control surface.',
  'Production Pulse': 'Converts daily shift and downtime noise into a usable manager execution view.',
  'Sales Signal': 'Converts market and distributor updates into one commercial watch layer.',
}

const PRIORITY_TO_MODULE: Record<SolutionPriority, string> = {
  actions: 'Action OS',
  follow_up: 'Action OS',
  director_visibility: 'Action OS',
  supplier: 'Supplier Watch',
  receiving: 'Receiving Control',
  inventory: 'Inventory Pulse',
  quality: 'Quality Closeout',
  cash: 'Cash Watch',
  sales: 'Sales Signal',
  production: 'Production Pulse',
  attendance: 'Production Pulse',
}

function appendUnique(values: string[], value: string) {
  if (value && !values.includes(value)) {
    values.push(value)
  }
}

export function buildLocalSolutionBlueprint(request: SolutionArchitectRequest): SolutionBlueprint {
  const servicePacks = ['Owner / Director OS']
  const isFactory = request.sector === 'factory'
  const isCommercial = request.sector === 'distribution' || request.sector === 'services'

  if (isFactory || request.priorities.some((item) => ['supplier', 'receiving', 'inventory', 'quality', 'production', 'attendance'].includes(item))) {
    servicePacks.push('Factory Control')
  }
  if (isCommercial || request.priorities.some((item) => ['cash', 'sales', 'follow_up'].includes(item))) {
    servicePacks.push('Commercial Control')
  }

  const recommendedModules = ['Action OS']
  request.priorities.forEach((priority) => appendUnique(recommendedModules, PRIORITY_TO_MODULE[priority]))

  if (isFactory) {
    ;['Receiving Control', 'Inventory Pulse', 'Supplier Watch', 'Quality Closeout', 'Production Pulse'].forEach((item) =>
      appendUnique(recommendedModules, item),
    )
  } else if (request.sector === 'distribution') {
    ;['Cash Watch', 'Sales Signal', 'Supplier Watch', 'Inventory Pulse'].forEach((item) => appendUnique(recommendedModules, item))
  } else if (request.sector === 'services') {
    ;['Cash Watch', 'Sales Signal'].forEach((item) => appendUnique(recommendedModules, item))
  } else {
    ;['Supplier Watch', 'Cash Watch', 'Sales Signal'].forEach((item) => appendUnique(recommendedModules, item))
  }

  const semiProducts: Array<{ name: string; reason: string }> = []
  if (request.priorities.some((item) => ['receiving', 'inventory', 'quality', 'cash', 'supplier'].includes(item))) {
    semiProducts.push({ name: 'Document Intake', reason: 'Use it as the intake layer so teams stop retyping files into later modules.' })
  }
  if (request.priorities.some((item) => ['supplier', 'cash', 'sales', 'follow_up'].includes(item))) {
    semiProducts.push({ name: 'Reply Draft', reason: 'Supports repetitive supplier, finance, and customer thread handling.' })
  }
  if (request.priorities.some((item) => ['actions', 'director_visibility', 'quality', 'cash', 'sales'].includes(item))) {
    semiProducts.push({ name: 'Director Flash', reason: 'Turns the operating layer into one short briefing surface for leaders.' })
  }
  if (request.priorities.some((item) => ['production', 'attendance'].includes(item))) {
    semiProducts.push({ name: 'Attendance Check-In', reason: 'Adds lightweight shift and site presence capture to the operating layer.' })
  }

  const freeTools: Array<{ name: string; reason: string }> = []
  if (request.priorities.some((item) => ['sales'].includes(item)) || isCommercial) {
    freeTools.push({ name: 'Lead Finder', reason: 'Useful front-door proof for outbound and commercial teams.' })
  }
  if (request.priorities.some((item) => ['director_visibility', 'supplier', 'production'].includes(item))) {
    freeTools.push({ name: 'News Brief', reason: 'Useful proof for watch layers and director-level context.' })
  }
  freeTools.push({ name: 'Action Board', reason: 'Best universal proof tool because it turns messy updates into a usable board.' })

  const agentTeams = [
    { name: 'Command Office', role: 'Owns director visibility, priorities, and review rhythm.' },
    { name: 'Control Tower', role: 'Runs the live queues for actions, suppliers, receiving, inventory, quality, and cash.' },
    { name: 'Client Delivery', role: 'Turns reusable templates into a live client rollout.' },
    { name: 'R&D Lab', role: 'Tests new tools, UX, and workflow upgrades before productizing them.' },
    { name: 'Platform Engineering', role: 'Owns connectors, APIs, state, evals, and deployment.' },
  ]
  if (isCommercial || request.priorities.includes('sales')) {
    agentTeams.push({ name: 'Growth Studio', role: 'Converts proof tools and outreach into pilot demand.' })
  }

  const implementationOrder = ['Action OS']
  if (isFactory) {
    ;['Receiving Control', 'Inventory Pulse', 'Supplier Watch', 'Quality Closeout', 'Production Pulse'].forEach((item) =>
      appendUnique(implementationOrder, item),
    )
  } else {
    recommendedModules.forEach((item) => appendUnique(implementationOrder, item))
  }
  appendUnique(implementationOrder, 'Approval Layer')

  const nextStack = ['SQLModel', 'Cloud Run', 'Cloud Scheduler', 'Cloud Tasks', 'Secret Manager']
  if (recommendedModules.some((item) => ['Receiving Control', 'Inventory Pulse', 'Cash Watch', 'Production Pulse'].includes(item))) {
    nextStack.push('Polars', 'DuckDB')
  }
  if (recommendedModules.length >= 4) {
    nextStack.push('LangGraph', 'PydanticAI')
  }
  if (request.sector !== 'factory') {
    nextStack.push('Playwright or Stagehand')
  }

  const uxSurfaces = ['Director command view', 'Manager action board', 'Exception queue', 'Document intake lane']
  if (recommendedModules.some((item) => ['Receiving Control', 'Inventory Pulse', 'Production Pulse'].includes(item))) {
    uxSurfaces.push('Operator mobile forms')
  }
  if (request.sector !== 'factory') {
    uxSurfaces.push('Commercial watch view')
  }

  return {
    company_name: request.company_name || 'New Client',
    sector: request.sector,
    team_size: request.team_size,
    site_count: request.site_count,
    service_packs: servicePacks,
    primary_pack: servicePacks[0],
    wedge_product: 'Action OS',
    flagship: 'SUPERMEGA.dev tenant stack',
    recommended_modules: recommendedModules.map((name) => ({ name, reason: MODULE_REASONS[name] || 'Recommended based on the operating profile.' })),
    semi_products: semiProducts,
    free_tools: freeTools,
    agent_teams: agentTeams,
    implementation_order: implementationOrder,
    current_stack: ['React', 'Vite', 'TypeScript', 'FastAPI', 'SQLite', 'Google APIs', 'PowerShell operators'],
    next_stack: nextStack,
    ux_surfaces: uxSurfaces,
    value_prop:
      request.sector === 'factory'
        ? 'Give the company one action layer first, then move into receiving, stock, supplier, and quality control without waiting for a heavy ERP rollout.'
        : 'Start with Action OS so the company gets one live control layer first, then add the modules that remove the most manual follow-up and hidden risk.',
    first_30_days: [
      'Connect one live input source and owner map.',
      'Stand up Action OS with a manager board and director flash.',
      `Deploy ${implementationOrder[1] || 'the first control module'} as the first deep workflow.`,
      'Add approvals and write-back only after the first board is trusted.',
    ],
    notes: [
      `Current tools: ${request.current_tools.join(', ') || 'not specified'}.`,
      `Data sources: ${request.data_sources.join(', ') || 'not specified'}.`,
      `Main pain point: ${request.pain_points || 'not specified'}.`,
    ],
    risks: [
      'Do not oversell full ERP replacement before the first action and control layers are stable.',
      'Keep browser-side automation as a sidecar, not the source of truth.',
      'Add approvals before enabling deeper autonomous writes or ERP write-back.',
    ],
  }
}
