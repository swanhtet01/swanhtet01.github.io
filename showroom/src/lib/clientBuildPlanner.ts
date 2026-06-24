import { buildAgentSkillPack, type AgentSkillPack } from './agentSkillLibrary'

export type ClientIndustryKitId = 'industrial' | 'restaurant-pos' | 'service-desk' | 'retail-ops' | 'custom'

export type ClientBuildModule = {
  id: string
  name: string
  kit: ClientIndustryKitId | 'shared'
  department: string
  role: string
  capability: string
  sourceInputs: string[]
  aiActions: string[]
  reviewGate: string
  kpi: string
  route: string
  sellAs: string
}

export type ClientIndustryKit = {
  id: ClientIndustryKitId
  name: string
  buyer: string
  promise: string
  firstTeam: string
  packageName: string
  moduleIds: string[]
  dataInputs: string[]
}

export type GeneralUseTool = {
  id: string
  name: string
  sellAs: string
  useCase: string
  route: string
  expansion: string
}

export type ClientBuildSpec = {
  company: string
  industryKit: ClientIndustryKitId
  roles: string
  currentSystems: string
  sourceInputs: string
  workflowPain: string
  selectedModuleIds: string[]
}

export type ClientBuildPlan = {
  kit: ClientIndustryKit
  packageName: string
  firstTeam: string
  recommendedModules: ClientBuildModule[]
  sharedShellModules: ClientBuildModule[]
  sourceMap: string[]
  aiWorkcells: string[]
  agentSkillPack: AgentSkillPack
  buildSteps: string[]
  generalTools: GeneralUseTool[]
  risks: string[]
  goal: string
  currentSystems: string[]
}

export const CLIENT_INDUSTRY_KITS: ClientIndustryKit[] = [
  {
    id: 'industrial',
    name: 'Factory Operations App',
    buyer: 'Factory owner, plant manager, quality lead',
    promise: 'Daily control for blockers, CAPA, maintenance, receiving, source evidence, and owner brief.',
    firstTeam: 'Operations',
    packageName: 'Factory Operations App Sprint',
    moduleIds: ['plant-manager-home', 'dqms-capa', 'maintenance-reliability', 'receiving-control', 'executive-brief'],
    dataInputs: ['ERP export', 'maintenance log', 'QC records', 'receiving sheet', 'Drive folders'],
  },
  {
    id: 'restaurant-pos',
    name: 'Restaurant POS + Inventory',
    buyer: 'Restaurant, cafe, retail, or service-counter owner',
    promise: 'One store desk for QR menu, provider payment proof, cash-up close, shift notes, stock, and owner report.',
    firstTeam: 'Store operations',
    packageName: 'Restaurant POS + Inventory Sprint',
    moduleIds: ['menu-transition', 'mmqr-proof', 'cashup-close', 'shift-board', 'owner-report'],
    dataInputs: ['Menu PDF/images', 'provider payment link/slip/export', 'cash-up sheet', 'POS export', 'manager notes'],
  },
  {
    id: 'service-desk',
    name: 'Service Desk POS',
    buyer: 'Spa, clinic, agency, support desk, service business owner',
    promise: 'Bookings, daily ledger, payments, expenses, staff tasks, client notes, and daily close in one desk.',
    firstTeam: 'Front desk',
    packageName: 'Service Desk POS Sprint',
    moduleIds: ['front-desk-ledger', 'appointment-flow', 'payment-cashup', 'client-followup', 'daily-close'],
    dataInputs: ['Booking sheet', 'payment log', 'expenses', 'staff roster', 'client messages'],
  },
  {
    id: 'retail-ops',
    name: 'Retail Ops Desk',
    buyer: 'Retail owner, store manager, distributor, ecommerce operator',
    promise: 'Stock, sales, returns, supplier issues, branch variance, and daily action review without a heavy ERP project.',
    firstTeam: 'Store operations',
    packageName: 'Retail Ops Sprint',
    moduleIds: ['stock-ledger', 'sales-register', 'supplier-claims', 'branch-variance', 'daily-close'],
    dataInputs: ['Sales export', 'inventory sheet', 'supplier invoices', 'returns log', 'branch notes'],
  },
  {
    id: 'custom',
    name: 'Custom Workflow Replacement',
    buyer: 'Any team replacing a repeated SaaS, spreadsheet, inbox, or browser workflow',
    promise: 'A narrow first module built from the client workflow, source files, roles, review gates, and KPI.',
    firstTeam: 'Owner team',
    packageName: 'Custom SaaS Replacement Sprint',
    moduleIds: ['source-intake', 'action-board', 'approval-review', 'evidence-brief', 'agent-workcell'],
    dataInputs: ['Sample source file', 'current SaaS export', 'inbox examples', 'browser steps', 'approval rules'],
  },
]

export const CLIENT_BUILD_MODULES: ClientBuildModule[] = [
  {
    id: 'login-roles',
    name: 'Login, Roles, and Tenant Shell',
    kit: 'shared',
    department: 'Admin',
    role: 'Owner, admin, manager',
    capability: 'Secure workspace entry, role menus, and module access.',
    sourceInputs: ['User list', 'roles', 'workspace domain'],
    aiActions: ['Suggest role map', 'find access gaps'],
    reviewGate: 'Admin approves users and role access.',
    kpi: 'Role setup completion',
    route: '/app/onboarding',
    sellAs: 'Every client portal shell',
  },
  {
    id: 'source-intake',
    name: 'Source Intake and Data Room',
    kit: 'shared',
    department: 'Data',
    role: 'Admin, analyst, manager',
    capability: 'Register files, emails, sheets, exports, and browser sources before building modules.',
    sourceInputs: ['Drive folders', 'Gmail labels', 'Sheets', 'CSV exports', 'PDFs'],
    aiActions: ['Classify source records', 'find missing fields', 'draft source map'],
    reviewGate: 'Owner approves source scope before ingestion.',
    kpi: 'Mapped source coverage',
    route: '/app/data-fabric',
    sellAs: 'Data room setup',
  },
  {
    id: 'action-board',
    name: 'Action Board',
    kit: 'shared',
    department: 'Operations',
    role: 'Manager',
    capability: 'One queue for open items, owner, evidence, next action, and due window.',
    sourceInputs: ['Tasks', 'exceptions', 'manager notes', 'source links'],
    aiActions: ['Cluster open items', 'draft next action', 'detect stale work'],
    reviewGate: 'Manager assigns owner and closes item.',
    kpi: 'Open high-priority actions',
    route: '/app/action-board',
    sellAs: 'Manager action queue',
  },
  {
    id: 'approval-review',
    name: 'Approval Review Gate',
    kit: 'shared',
    department: 'Governance',
    role: 'Owner, manager',
    capability: 'Stage AI output, changes, payment exceptions, CAPA, or client-facing messages for human approval.',
    sourceInputs: ['Draft output', 'evidence', 'decision policy'],
    aiActions: ['Prepare approval packet', 'explain risk', 'draft decision options'],
    reviewGate: 'Human owner approves all writeback.',
    kpi: 'Pending approvals aging',
    route: '/app/approvals',
    sellAs: 'Human-in-the-loop control',
  },
  {
    id: 'evidence-brief',
    name: 'Evidence Brief',
    kit: 'shared',
    department: 'Leadership',
    role: 'CEO, director, owner',
    capability: 'Compress source changes, KPIs, blockers, and decisions into one brief.',
    sourceInputs: ['Source map', 'KPI records', 'action queue', 'decision journal'],
    aiActions: ['Summarize evidence', 'explain KPI movement', 'draft owner brief'],
    reviewGate: 'Owner validates brief before distribution.',
    kpi: 'Briefs with source evidence',
    route: '/app/daily-brief',
    sellAs: 'Executive daily brief',
  },
  {
    id: 'agent-workcell',
    name: 'Automation Review Lane',
    kit: 'shared',
    department: 'Automation',
    role: 'Operator, admin',
    capability: 'Bounded preparation lane for one task family with tools, source scope, and approval policy.',
    sourceInputs: ['Task template', 'allowed tools', 'source scope', 'approval policy'],
    aiActions: ['Run draft task', 'prepare proof', 'escalate blocked records'],
    reviewGate: 'No tool writeback without route owner approval.',
    kpi: 'Reviewed agent outputs',
    route: '/app/workforce',
    sellAs: 'Automation review lane',
  },
  {
    id: 'plant-manager-home',
    name: 'Plant Manager Home',
    kit: 'industrial',
    department: 'Operations',
    role: 'Plant manager',
    capability: 'Daily blockers, shifts, owner decisions, and evidence status.',
    sourceInputs: ['Production notes', 'shift handover', 'ERP export', 'manager notes'],
    aiActions: ['Rank blockers', 'draft shift brief', 'detect carryover'],
    reviewGate: 'Plant manager owns next action.',
    kpi: 'Open plant blockers',
    route: '/app/plant-manager',
    sellAs: 'Factory daily control',
  },
  {
    id: 'dqms-capa',
    name: 'DQMS and CAPA',
    kit: 'industrial',
    department: 'Quality',
    role: 'QC manager',
    capability: 'Nonconformance, containment, CAPA, evidence, and closeout.',
    sourceInputs: ['QC records', 'incident photos', 'test sheets', 'CAPA logs'],
    aiActions: ['Draft CAPA', 'cluster repeat defects', 'check missing proof'],
    reviewGate: 'Quality manager approves CAPA.',
    kpi: 'CAPA aging',
    route: '/app/dqms',
    sellAs: 'Quality action control',
  },
  {
    id: 'maintenance-reliability',
    name: 'Maintenance Reliability',
    kit: 'industrial',
    department: 'Maintenance',
    role: 'Maintenance lead',
    capability: 'Downtime, preventive tasks, repeat failure review, and equipment evidence.',
    sourceInputs: ['Maintenance log', 'machine list', 'downtime sheet'],
    aiActions: ['Find repeat stoppage', 'draft 5 Why', 'suggest PM action'],
    reviewGate: 'Maintenance lead approves work order.',
    kpi: 'Repeat downtime',
    route: '/app/maintenance',
    sellAs: 'Reliability desk',
  },
  {
    id: 'receiving-control',
    name: 'Receiving Control',
    kit: 'industrial',
    department: 'Warehouse',
    role: 'Receiving lead',
    capability: 'Supplier holds, GRN mismatches, inbound issues, and release decisions.',
    sourceInputs: ['GRN', 'invoice', 'supplier docs', 'QC status'],
    aiActions: ['Match supplier docs', 'draft hold reason', 'prepare release packet'],
    reviewGate: 'Warehouse or quality owner approves disposition.',
    kpi: 'Blocked inbound batches',
    route: '/app/receiving',
    sellAs: 'Supplier receiving desk',
  },
  {
    id: 'executive-brief',
    name: 'Executive Brief',
    kit: 'industrial',
    department: 'Leadership',
    role: 'CEO',
    capability: 'Plant risk, cash impact, quality risk, supplier escalation, and owner decisions.',
    sourceInputs: ['Daily brief', 'KPI records', 'action queue', 'sales risk'],
    aiActions: ['Explain plant risk', 'draft owner decisions', 'prepare escalation note'],
    reviewGate: 'CEO approves decisions.',
    kpi: 'Decisions made from source evidence',
    route: '/app/daily-brief',
    sellAs: 'Owner decision brief',
  },
  {
    id: 'menu-transition',
    name: 'Menu Transition',
    kit: 'restaurant-pos',
    department: 'Store',
    role: 'Owner, manager',
    capability: 'Turn menu PDFs/images into structured items, public menu, and approval queue.',
    sourceInputs: ['Menu PDF', 'menu images', 'item list', 'prices'],
    aiActions: ['Extract menu items', 'normalize prices', 'draft descriptions'],
    reviewGate: 'Manager approves menu before publish.',
    kpi: 'Time to menu update',
    route: '/app/restaurant-os',
    sellAs: 'Menu digitization',
  },
  {
    id: 'payment-cashup',
    name: 'Payment Proof and Cash-Up Control',
    kit: 'restaurant-pos',
    department: 'Finance',
    role: 'Cashier lead, owner',
    capability: 'Provider payment proof, settlement reference, proof note, and cash-up exception review.',
    sourceInputs: ['Provider payment export', 'order ref', 'receipt', 'settlement screenshot'],
    aiActions: ['Match settlement proof', 'flag unpaid order', 'draft cash-up exception'],
    reviewGate: 'Cashier lead approves paid/reconcile status.',
    kpi: 'Unreconciled payment value',
    route: '/app/restaurant-os',
    sellAs: 'Payment proof control',
  },
  {
    id: 'shift-board',
    name: 'Shift Board',
    kit: 'restaurant-pos',
    department: 'Store',
    role: 'Store manager',
    capability: 'Opening, lunch, dinner, close, blocker, handover, and owner note.',
    sourceInputs: ['Shift notes', 'staff roster', 'manager handover'],
    aiActions: ['Summarize handover', 'flag recurring blockers', 'draft next shift checklist'],
    reviewGate: 'Store manager closes the shift.',
    kpi: 'Open shift blockers',
    route: '/app/restaurant-os',
    sellAs: 'Daily store control',
  },
  {
    id: 'prep-stock',
    name: 'Prep, Stock, and Waste',
    kit: 'restaurant-pos',
    department: 'Kitchen',
    role: 'Kitchen lead',
    capability: 'Par, current stock, waste, supplier issue, and action note.',
    sourceInputs: ['Prep count', 'waste photo', 'supplier invoice', 'POS mix'],
    aiActions: ['Explain variance', 'draft reorder', 'flag waste drift'],
    reviewGate: 'Kitchen lead approves stock action.',
    kpi: 'Stockout risk',
    route: '/app/restaurant-os',
    sellAs: 'Kitchen stock control',
  },
  {
    id: 'guest-recovery',
    name: 'Guest Recovery',
    kit: 'restaurant-pos',
    department: 'Service',
    role: 'Area manager',
    capability: 'Reviews, delivery issues, refunds, training cues, and recovery notes.',
    sourceInputs: ['Reviews', 'delivery app notes', 'refund log', 'manager notes'],
    aiActions: ['Cluster complaints', 'draft recovery note', 'suggest training cue'],
    reviewGate: 'Manager approves customer-facing response.',
    kpi: 'Repeat complaint rate',
    route: '/app/restaurant-os',
    sellAs: 'Guest recovery desk',
  },
  {
    id: 'front-desk-ledger',
    name: 'Front Desk Ledger',
    kit: 'service-desk',
    department: 'Front desk',
    role: 'Cashier, receptionist',
    capability: 'Bookings, service sale, product sale, expense, and daily totals.',
    sourceInputs: ['Booking sheet', 'service catalog', 'payment log'],
    aiActions: ['Find missing close records', 'summarize day', 'flag mismatched totals'],
    reviewGate: 'Front desk lead closes day.',
    kpi: 'Daily close variance',
    route: '/app/service-desk',
    sellAs: 'Service business POS',
  },
  {
    id: 'appointment-flow',
    name: 'Appointment Flow',
    kit: 'service-desk',
    department: 'Operations',
    role: 'Reception, manager',
    capability: 'Appointments, staff assignment, no-show, reminder, and follow-up.',
    sourceInputs: ['Calendar', 'booking messages', 'staff roster'],
    aiActions: ['Draft reminders', 'spot booking gaps', 'prepare staff schedule'],
    reviewGate: 'Manager approves customer messages.',
    kpi: 'No-show rate',
    route: '/app/service-desk',
    sellAs: 'Appointment desk',
  },
  {
    id: 'client-followup',
    name: 'Client Follow-Up',
    kit: 'service-desk',
    department: 'Sales',
    role: 'Front desk, owner',
    capability: 'Follow-up queue, reminders, customer notes, next visit, and outreach proof.',
    sourceInputs: ['Customer list', 'messages', 'last visit', 'notes'],
    aiActions: ['Draft follow-up', 'rank warm clients', 'flag overdue response'],
    reviewGate: 'Owner approves outreach.',
    kpi: 'Follow-ups completed',
    route: '/app/revenue',
    sellAs: 'Retention follow-up',
  },
  {
    id: 'daily-close',
    name: 'Daily Close',
    kit: 'service-desk',
    department: 'Finance',
    role: 'Owner, cashier',
    capability: 'Sales, cash, digital payments, expenses, and close note.',
    sourceInputs: ['Daily ledger', 'cash count', 'payment export', 'expenses'],
    aiActions: ['Explain variance', 'draft close summary', 'flag missing proof'],
    reviewGate: 'Owner approves close.',
    kpi: 'Close completion',
    route: '/app/service-desk',
    sellAs: 'Daily close control',
  },
  {
    id: 'stock-ledger',
    name: 'Stock Ledger',
    kit: 'retail-ops',
    department: 'Store',
    role: 'Store manager',
    capability: 'Stock on hand, reorder, shrinkage, supplier issue, and branch transfer.',
    sourceInputs: ['Inventory sheet', 'sales export', 'supplier invoice'],
    aiActions: ['Find reorder risk', 'explain shrinkage', 'draft supplier note'],
    reviewGate: 'Store manager approves stock move.',
    kpi: 'Stockout risk',
    route: '/app/inventory',
    sellAs: 'Retail stock control',
  },
  {
    id: 'sales-register',
    name: 'Sales Register',
    kit: 'retail-ops',
    department: 'Sales',
    role: 'Store staff, owner',
    capability: 'Sales, returns, promo, branch totals, and daily variance.',
    sourceInputs: ['Sales export', 'return log', 'promo list'],
    aiActions: ['Explain branch variance', 'flag return spike', 'draft daily sales note'],
    reviewGate: 'Owner approves sales adjustments.',
    kpi: 'Sales variance',
    route: '/app/revenue',
    sellAs: 'Retail sales desk',
  },
  {
    id: 'supplier-claims',
    name: 'Supplier Claims',
    kit: 'retail-ops',
    department: 'Purchasing',
    role: 'Purchasing, store manager',
    capability: 'Short delivery, wrong item, price mismatch, credit note, and follow-up.',
    sourceInputs: ['Invoice', 'receiving photo', 'PO', 'supplier chat'],
    aiActions: ['Draft claim packet', 'match invoice lines', 'prepare follow-up'],
    reviewGate: 'Purchasing approves supplier message.',
    kpi: 'Open supplier claims',
    route: '/app/receiving',
    sellAs: 'Supplier claim desk',
  },
  {
    id: 'branch-variance',
    name: 'Branch Variance',
    kit: 'retail-ops',
    department: 'Leadership',
    role: 'Owner, area manager',
    capability: 'Compare branch sales, stock, returns, staffing, and action follow-up.',
    sourceInputs: ['Branch sales', 'stock sheet', 'staff schedule', 'returns'],
    aiActions: ['Explain variance', 'draft action plan', 'flag branch drift'],
    reviewGate: 'Owner approves branch action.',
    kpi: 'Branch variance closed',
    route: '/app/insights',
    sellAs: 'Branch performance brief',
  },
]

export const GENERAL_USE_TOOLS: GeneralUseTool[] = [
  {
    id: 'workflow-scan',
    name: 'Workflow Scan',
    sellAs: 'Free lead magnet or paid diagnostic',
    useCase: 'Client names the SaaS, spreadsheet, inbox, browser loop, or manual report to replace.',
    route: '/intake',
    expansion: 'Becomes a Portal Launch Sprint.',
  },
  {
    id: 'source-map',
    name: 'Source Map',
    sellAs: 'Data room setup',
    useCase: 'Maps Drive, Gmail, Sheets, PDFs, exports, and browser systems before custom modules are built.',
    route: '/app/data-fabric',
    expansion: 'Becomes knowledge graph and agent source scope.',
  },
  {
    id: 'action-board-tool',
    name: 'Action Board',
    sellAs: 'Universal manager tool',
    useCase: 'Turns scattered exceptions into owner, evidence, due date, and closeout.',
    route: '/app/action-board',
    expansion: 'Becomes role workspaces and approval gates.',
  },
  {
    id: 'doc-intake',
    name: 'Document Intake',
    sellAs: 'Document review desk',
    useCase: 'Extracts fields, missing evidence, and next actions from PDFs, sheets, notes, and screenshots.',
    route: '/app/documents',
    expansion: 'Becomes source-aware data science and reporting.',
  },
  {
    id: 'daily-brief-tool',
    name: 'Daily Brief',
    sellAs: 'Owner brief subscription',
    useCase: 'Summarizes changes, blockers, risk, and decisions with source evidence.',
    route: '/app/daily-brief',
    expansion: 'Becomes executive cockpit.',
  },
  {
    id: 'browser-worker',
    name: 'Browser Worker Queue',
    sellAs: 'Automation pilot',
    useCase: 'Stages repetitive browser tasks for AI execution with permission and review gates.',
    route: '/app/workforce',
    expansion: 'Becomes bounded automation workforce.',
  },
]

export function parseClientList(value: string) {
  return value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getKit(id: ClientIndustryKitId) {
  return CLIENT_INDUSTRY_KITS.find((item) => item.id === id) ?? CLIENT_INDUSTRY_KITS[0]
}

function scoreModule(module: ClientBuildModule, spec: ClientBuildSpec, kit: ClientIndustryKit) {
  const text = `${spec.roles} ${spec.currentSystems} ${spec.sourceInputs} ${spec.workflowPain}`.toLowerCase()
  let score = 0
  if (spec.selectedModuleIds.includes(module.id)) score += 100
  if (module.kit === 'shared') score += 14
  if (module.kit === kit.id) score += 35
  if (kit.moduleIds.includes(module.id)) score += 22
  for (const token of [module.department, module.role, module.name, module.capability, module.kpi]) {
    for (const word of token.toLowerCase().split(/[^a-z0-9]+/g).filter((item) => item.length > 3)) {
      if (text.includes(word)) score += 4
    }
  }
  return score
}

export function buildClientBuildPlan(spec: ClientBuildSpec): ClientBuildPlan {
  const kit = getKit(spec.industryKit)
  const sharedShellModules = CLIENT_BUILD_MODULES.filter((module) => module.kit === 'shared').slice(0, 6)
  const scored = CLIENT_BUILD_MODULES
    .filter((module) => module.kit !== 'shared')
    .map((module) => ({ module, score: scoreModule(module, spec, kit) }))
    .sort((a, b) => b.score - a.score || a.module.name.localeCompare(b.module.name))
  const selectedModules = scored.slice(0, 6).map((item) => item.module)
  const sourceMap = Array.from(new Set([...kit.dataInputs, ...parseClientList(spec.currentSystems), ...parseClientList(spec.sourceInputs)])).slice(0, 10)
  const currentSystems = Array.from(new Set([...parseClientList(spec.currentSystems), ...parseClientList(spec.sourceInputs)])).slice(0, 12)
  const firstTeam = spec.roles.trim() ? spec.roles.split(/[,;\n]+/g)[0]?.trim() || kit.firstTeam : kit.firstTeam
  const aiWorkcells = selectedModules.slice(0, 4).map((module) => `${module.name}: ${module.aiActions[0]} with ${module.reviewGate.toLowerCase()}`)
  const agentSkillPack = buildAgentSkillPack({
    industryKit: kit.id,
    moduleIds: selectedModules.map((module) => module.id),
    sourceInputs: sourceMap,
  })
  const buildSteps = [
    'Create workspace shell, login, roles, and first owner account.',
    `Map sources: ${sourceMap.slice(0, 4).join(', ') || 'first sample files'}.`,
    `Ship first module: ${selectedModules[0]?.name || 'Action Board'}.`,
    'Add prepared draft checks only after source fields and review gate are clear.',
    'Run smoke test, proof script, and go-live checklist before client handoff.',
  ]
  const generalTools = GENERAL_USE_TOOLS.filter((tool) => {
    if (kit.id === 'restaurant-pos') return ['workflow-scan', 'source-map', 'action-board-tool', 'daily-brief-tool'].includes(tool.id)
    if (kit.id === 'industrial') return ['workflow-scan', 'source-map', 'action-board-tool', 'doc-intake', 'daily-brief-tool'].includes(tool.id)
    return ['workflow-scan', 'source-map', 'action-board-tool', 'doc-intake', 'browser-worker'].includes(tool.id)
  })
  const risks = [
    sourceMap.length < 3 ? 'Need at least one real file/export/link before promising automation.' : '',
    spec.workflowPain.trim().length < 40 ? 'Workflow pain is too vague; capture current owner, frequency, and done state.' : '',
    spec.roles.trim().length < 3 ? 'No role owner yet; choose who approves the first module.' : '',
  ].filter(Boolean)
  const goal = [
    `Client build plan for ${spec.company || 'new client'}`,
    `Industry kit: ${kit.name}`,
    `First team: ${firstTeam}`,
    spec.workflowPain.trim() ? `Workflow to replace: ${spec.workflowPain.trim()}` : '',
    selectedModules.length ? `Recommended modules: ${selectedModules.map((module) => module.name).join(', ')}` : '',
    agentSkillPack.agents.length ? `Automation lanes: ${agentSkillPack.agents.map((agent) => agent.name).join(', ')}` : '',
    agentSkillPack.commands.length ? `Review commands: ${agentSkillPack.commands.map((command) => command.label).join(', ')}` : '',
    sourceMap.length ? `Source inputs: ${sourceMap.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  return {
    kit,
    packageName: kit.packageName,
    firstTeam,
    recommendedModules: selectedModules,
    sharedShellModules,
    sourceMap,
    aiWorkcells,
    agentSkillPack,
    buildSteps,
    generalTools,
    risks,
    goal,
    currentSystems,
  }
}

export function createDefaultClientBuildSpec(company = ''): ClientBuildSpec {
  return {
    company,
    industryKit: 'industrial',
    roles: '',
    currentSystems: '',
    sourceInputs: '',
    workflowPain: '',
    selectedModuleIds: [],
  }
}
