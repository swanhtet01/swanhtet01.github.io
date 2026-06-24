export type ClientOnboardingStage = {
  id: string
  label: string
  buyerQuestion: string
  action: string
  output: string
  route: string
  gate: string
}

export type PortalProductStackItem = {
  id: string
  name: string
  buyer: string
  useWhen: string
  firstWorkflow: string
  modules: string[]
  agentLoops: string[]
  route: string
  proof: string
}

export type EnterpriseAgentWorkflow = {
  id: string
  name: string
  trigger: string
  agents: string[]
  tools: string[]
  outputs: string[]
  reviewGate: string
  metric: string
  route: string
}

export type PlatformOperatingScore = {
  id: string
  area: string
  score: number
  evidence: string
  nextBuild: string
  route: string
}

export type ProductLadderStage = {
  id: string
  label: string
  customerLanguage: string
  internalJob: string
  output: string
  automation: string
  route: string
}

export type SellableProductLine = {
  id: string
  name: string
  status: 'Sell now' | 'Proof route' | 'Internal engine' | 'Internal control plane'
  buyer: string
  simplePitch: string
  firstSale: string
  modules: string[]
  proofRoute: string
  proof: string
}

export type CustomerCommunicationAutomation = {
  id: string
  stage: string
  customerSees: string
  systemDoes: string
  owner: string
  output: string
}

export type SaasReplacementPrimitive = {
  id: string
  name: string
  replaces: string
  reusableAcross: string[]
  productRule: string
}

export const CLIENT_ONBOARDING_FLOW: ClientOnboardingStage[] = [
  {
    id: 'choose-fit',
    label: 'Choose fit',
    buyerQuestion: 'Which daily workflow is wasting the most time?',
    action: 'Open one product proof route that matches the buyer: Back Office Workflow Desk, Factory Operations App, or Restaurant POS + Inventory.',
    output: 'One clear use case and first user group.',
    route: '/login?next=/app/start',
    gate: 'Do not show every module first.',
  },
  {
    id: 'show-live-desk',
    label: 'Show live desk',
    buyerQuestion: 'What does my team actually open?',
    action: 'Show one route, one queue, one record, and one next action.',
    output: 'Buyer understands the first screen and why it replaces the current tool.',
    route: '/app/start',
    gate: 'No fake dashboard tour.',
  },
  {
    id: 'map-sources',
    label: 'Map sources',
    buyerQuestion: 'Where does the truth live today?',
    action: 'List folders, inboxes, sheets, exports, forms, photos, and owners.',
    output: 'Connector/source ledger with scope and review owner.',
    route: '/app/connectors',
    gate: 'No AI action without source scope.',
  },
  {
    id: 'build-first-module',
    label: 'Build first module',
    buyerQuestion: 'What can go live in days?',
    action: 'Use Workspace Setup to generate the smallest role-ready module packet.',
    output: 'Roles, module contract, source inputs, AI actions, review gate, smoke checks.',
    route: '/app/portal-factory',
    gate: 'Ship one workflow before expanding.',
  },
  {
    id: 'operate-and-adapt',
    label: 'Operate and adapt',
    buyerQuestion: 'How does it keep improving?',
    action: 'Run tasks, watch source changes, queue reviewed agent work, and promote the next module from evidence.',
    output: 'Tasks, KPI story, source-change queue, and next module recommendation.',
    route: '/app/meta-ops',
    gate: 'Every agent output stays reviewable.',
  },
]

export const SUPERMEGA_PRODUCT_LADDER: ProductLadderStage[] = [
  {
    id: 'workflow-signal',
    label: '1. Capture one workflow',
    customerLanguage: 'Tell us one work process your team keeps chasing manually.',
    internalJob: 'Classify buyer, company type, role, current tools, source sample, and urgency.',
    output: 'Scored lead and first-workflow intake.',
    automation: 'Contact form, business-card QR, lead router, and follow-up queue.',
    route: '/contact',
  },
  {
    id: 'first-system',
    label: '2. Build first useful system',
    customerLanguage: 'We make the first screen your team can actually use.',
    internalJob: 'Choose one module, one role view, source inputs, KPI, and review gate.',
    output: 'First workflow sprint scope.',
    automation: 'Workspace Setup manifest plus module readiness contract.',
    route: '/app/portal-factory',
  },
  {
    id: 'portal-kit',
    label: '3. Expand into a portal kit',
    customerLanguage: 'Add the next modules only after the first workflow proves value.',
    internalJob: 'Promote adjacent modules by department, role, industry, and data source.',
    output: 'Industrial, restaurant/retail, or custom workspace.',
    automation: 'Module registry, role policy, launch tasks, QA route checks.',
    route: '/products',
  },
  {
    id: 'agent-workforce',
    label: '4. Add reviewed AI workers',
    customerLanguage: 'AI prepares summaries, checks missing evidence, and drafts next actions for approval.',
    internalJob: 'Run bounded agents with source scope, tool policy, audit log, evals, and rollback notes.',
    output: 'Agent workforce attached to live business records.',
    automation: 'Agent runtime, source ledger, task queue, review gates.',
    route: '/app/teams',
  },
  {
    id: 'managed-company-os',
    label: '5. Operate the company OS',
    customerLanguage: 'The system learns from files, tasks, approvals, and manager decisions over time.',
    internalJob: 'Watch source changes, surface gaps, recommend next module, and keep QA green.',
    output: 'Adaptive client operating system.',
    automation: 'Meta Ops cockpit, source-change monitor, release QA, module readiness score.',
    route: '/app/meta-ops',
  },
]

export const CURRENT_PRODUCT_LINES: SellableProductLine[] = [
  {
    id: 'ai-workflow-desk',
    name: 'Back Office Workflow Desk',
    status: 'Sell now',
    buyer: 'Any owner, operator, admin, sales, support, or manager with one repeated manual workflow',
    simplePitch: 'Send one painful workflow and source samples. We turn it into a source-backed prepared work queue with approval gates and proof.',
    firstSale: 'Workflow Desk Deployment Sprint.',
    modules: ['Source Register', 'Prepared Work Queue', 'Browser Step Review', 'Approval Gate', 'Evidence Pack'],
    proofRoute: '/app/documents',
    proof: 'Best flagship because it makes enterprise agents deployable inside one real workflow instead of staying as prototypes.',
  },
  {
    id: 'cloud-agent-army',
    name: 'Hosted Operations',
    status: 'Internal control plane',
    buyer: 'Founder, platform admin, and later clients with multiple managed workflows',
    simplePitch: 'Run growth, intake, build, QA, and proof loops as cloud-scheduled, queue-backed, approval-gated workcells.',
    firstSale: 'Managed Workflow Desk retainer after the first Document Extraction Ledger proof.',
    modules: ['Cloud Runtime Lanes', 'Work Pods', '100k Growth Loop', 'Approval Gates', 'Dispatch Board'],
    proofRoute: '/app/cloud-agent-army',
    proof: 'Makes the one-founder company scalable without local recurring tasks or uncontrolled external actions.',
  },
  {
    id: 'first-workflow-sprint',
    name: 'First Workflow Sprint',
    status: 'Sell now',
    buyer: 'Any owner or manager with one repeated manual workflow',
    simplePitch: 'Send one messy workflow. We turn it into the first private app screen, role flow, and build scope.',
    firstSale: 'Workflow audit and first-system scope.',
    modules: ['Intake', 'source evidence', 'role map', 'first screen', 'quote-ready scope'],
    proofRoute: '/contact',
    proof: 'Business-card QR, lead router, intake worksheet, and contact form already support this.',
  },
  {
    id: 'easy-erp',
    name: 'Factory Operations App',
    status: 'Proof route',
    buyer: 'Factory, warehouse, distributor, restaurant group, or service business that still runs records in sheets',
    simplePitch: 'Simple ERP records first: items, stock movement, purchase queue, sales/order register, approvals, and audit history.',
    firstSale: 'ERP starter sprint around one transaction flow.',
    modules: ['Item Master', 'Inventory Ledger', 'Purchase Queue', 'Customer/Order Register', 'Approval History'],
    proofRoute: '/app/erp',
    proof: 'Best bridge from spreadsheet chaos to a real operating system without selling a heavy ERP migration first.',
  },
  {
    id: 'factory-operations-pack',
    name: 'Factory Operations Pack',
    status: 'Proof route',
    buyer: 'Factory owner, plant manager, quality lead',
    simplePitch: 'Daily plant control, quality/CAPA, maintenance reliability, receiving control, and executive decisions in one role-safe system.',
    firstSale: 'Plant daily control or quality closeout sprint.',
    modules: ['Plant Manager Home', 'DQMS/CAPA', 'Maintenance Reliability', 'Receiving Control', 'Executive Brief'],
    proofRoute: '/app/plant-manager',
    proof: 'Expansion pack after Factory Operations App or Factory Live State because it maps to real industrial management work instead of generic dashboards.',
  },
  {
    id: 'operations-digital-twin',
    name: 'Factory Live State',
    status: 'Sell now',
    buyer: 'Factory, facility, warehouse, or energy lead with machines, meters, or recurring maintenance decisions',
    simplePitch: 'Connect one machine, meter, or operating line to a live software model with readings, state, anomalies, evidence, and manager actions.',
    firstSale: 'Digital twin starter sprint.',
    modules: ['Asset Twin', 'Smart Meter Lane', 'Telemetry History', 'Anomaly Queue', 'Manager Action Board'],
    proofRoute: '/app/factory-operations',
    proof: 'This is the most defensible wedge because it combines custom software, physical telemetry, data quality, and reviewed AI operations.',
  },
  {
    id: 'restaurant-pos-desk',
    name: 'Restaurant POS + Inventory',
    status: 'Proof route',
    buyer: 'Restaurant, cafe, retail, or service-counter owner',
    simplePitch: 'Menu/items, orders, payment proof, cash-up close, and the owner report in one simple desk.',
    firstSale: 'Restaurant/retail POS and daily-close sprint.',
    modules: ['Menu and Items', 'Orders and Payments', 'Cash-Up Close', 'Shift Board', 'Owner Report'],
    proofRoute: '/app/restaurant-pos',
    proof: 'Fastest Myanmar small-business wedge because the owner sees payment proof and daily close before any heavy POS migration.',
  },
  {
    id: 'portal-launch-sprint',
    name: 'Workspace Setup',
    status: 'Internal engine',
    buyer: 'SuperMega delivery team first, then partners/agencies',
    simplePitch: 'Turn a client checklist into module choices, source map, proof script, quote, launch tasks, and QA gates.',
    firstSale: 'Custom workspace setup sprint.',
    modules: ['Client Intake', 'Module Matcher', 'Source Map', 'Proof Script', 'Launch QA'],
    proofRoute: '/app/portal-factory',
    proof: 'This is the scaling product: it turns custom portals from hand-built projects into repeatable delivery.',
  },
]

export const NEXT_PRODUCT_TO_BUILD = {
  id: 'ai-workflow-desk',
  name: 'Back Office Workflow Desk',
  shortPitch: 'The customer sends one painful workflow; SuperMega produces the source register, work queue, approval policy, proof pack, and expansion map.',
  whyItMatters: 'This is the bridge from impressive prototypes to deployed enterprise workflow systems. It makes custom SaaS and implementation legible as one sellable product.',
  firstRelease: ['workflow intake', 'source register', 'prepared work queue', 'browser-step checklist', 'approval gate', 'proof pack', 'next-module map'],
  sellableOutcome: 'A governed Back Office Workflow Desk live in days, with proof before expansion.',
  route: '/app/documents',
} as const

export const CUSTOMER_COMMUNICATION_AUTOMATION: CustomerCommunicationAutomation[] = [
  {
    id: 'scan-or-contact',
    stage: 'Scan or contact',
    customerSees: 'Simple form: what should work better first?',
    systemDoes: 'Captures UTM source, requested package, company, workflow pain, and source-sample readiness.',
    owner: 'Lead router',
    output: 'Lead row and follow-up task.',
  },
  {
    id: 'qualify',
    stage: 'Qualify',
    customerSees: 'A short reply asking for one sample file, screenshot, sheet, or message thread.',
    systemDoes: 'Scores ownership, pain, data availability, and budget access.',
    owner: 'Founder / sales agent',
    output: '6/10+ leads become first-workflow opportunities.',
  },
  {
    id: 'scope',
    stage: 'Scope',
    customerSees: 'One-page first-system scope.',
    systemDoes: 'Maps roles, source truth, KPI, first screen, AI actions, review gate, and what not to build yet.',
    owner: 'Solution architect agent',
    output: 'Quote-ready scope and proof path.',
  },
  {
    id: 'launch',
    stage: 'Launch',
    customerSees: 'Login, proof workspace, and a simple first action.',
    systemDoes: 'Creates launch tasks, smoke checks, role policy, source checklist, and handoff script.',
    owner: 'Tenant operator',
    output: 'Client-ready portal launch packet.',
  },
  {
    id: 'learn',
    stage: 'Learn and expand',
    customerSees: 'More useful modules appear from real usage and source changes.',
    systemDoes: 'Watches data changes, missed tasks, KPI movement, and user decisions to recommend the next module.',
    owner: 'Meta Ops cockpit',
    output: 'Next module recommendation with evidence.',
  },
]

export const SAAS_REPLACEMENT_PRIMITIVES: SaasReplacementPrimitive[] = [
  {
    id: 'identity-role-shell',
    name: 'Identity and role shell',
    replaces: 'Separate logins, permission spreadsheets, and per-tool admin setup.',
    reusableAcross: ['all portals', 'all client workspaces'],
    productRule: 'Every portal starts with login, role, allowed routes, and audit trail before features.',
  },
  {
    id: 'source-intake',
    name: 'Source intake',
    replaces: 'Manual file chasing, inbox searching, spreadsheet copying, and screenshot-based updates.',
    reusableAcross: ['industrial', 'restaurant', 'service', 'custom portal'],
    productRule: 'AI can classify and extract, but source owners approve canonical records.',
  },
  {
    id: 'work-queue',
    name: 'Work queue',
    replaces: 'CRM tasks, ticket boards, approval sheets, and chat reminders.',
    reusableAcross: ['sales', 'operations', 'quality', 'service', 'finance'],
    productRule: 'Every item needs owner, state, source evidence, next action, and review status.',
  },
  {
    id: 'digital-twin-state',
    name: 'Digital twin state model',
    replaces: 'Separate meter dashboards, machine logs, manual readings, and disconnected maintenance notes.',
    reusableAcross: ['factory', 'facility', 'warehouse', 'energy', 'field service'],
    productRule: 'Every physical signal needs device/source identity, timestamp, calibration note, confidence, owner action, and safety boundary.',
  },
  {
    id: 'knowledge-memory',
    name: 'Knowledge memory',
    replaces: 'Document portals, static wikis, and disconnected knowledge bases.',
    reusableAcross: ['company memory', 'module context', 'agent runtime'],
    productRule: 'Memory is useful only when it is source-linked, role-safe, and tied to current work.',
  },
  {
    id: 'reviewed-agent-runtime',
    name: 'Reviewed agent runtime',
    replaces: 'Uncontrolled chatbots and manual clerical prep.',
    reusableAcross: ['summaries', 'data cleanup', 'drafts', 'KPI explanations', 'QA'],
    productRule: 'Agents prepare and route work; humans approve business decisions and external writeback.',
  },
]

export const PORTAL_PRODUCT_STACK: PortalProductStackItem[] = [
  {
    id: 'ai-workflow-desk',
    name: 'Back Office Workflow Desk',
    buyer: 'Owner, operator, admin, sales, support, finance, or manager',
    useWhen: 'A workflow crosses files, inboxes, spreadsheets, browser portals, staff follow-up, and approvals.',
    firstWorkflow: 'Source-backed work queue with prepared actions and human approval before risky changes.',
    modules: ['Source register', 'work queue', 'browser-worker lane', 'approval gate', 'evidence pack'],
    agentLoops: ['source normalization', 'task drafting', 'browser action staging', 'proof pack generation'],
    route: '/app/documents',
    proof: 'Most repeatable flagship because it can wrap any one workflow before becoming a larger portal kit.',
  },
  {
    id: 'industrial-plant-os',
    name: 'Factory Operations Pack',
    buyer: 'Factory owner, plant manager, quality lead',
    useWhen: 'Production, quality, maintenance, receiving, safety, and KPI evidence are scattered across people and files.',
    firstWorkflow: 'Daily plant control: what changed, what is blocked, who owns it, and what evidence proves it.',
    modules: ['Daily brief', 'Operations command', 'DQMS/CAPA', 'Maintenance reliability', 'Receiving control', 'Source evidence ledger'],
    agentLoops: ['OEE variance brief', 'CAPA packet draft', 'repeat-fault clustering', 'supplier claim assembly'],
    route: '/app/plant-manager',
    proof: 'Best flagship product proof because the modules are consequential and standards-backed.',
  },
  {
    id: 'operations-digital-twin',
    name: 'Factory Live State',
    buyer: 'Factory, facility, warehouse, or energy lead',
    useWhen: 'Machines, meters, maintenance, energy use, and manager actions are disconnected from the daily software workspace.',
    firstWorkflow: 'One asset or meter becomes a live state view with reading history, abnormal-use flags, and owner action.',
    modules: ['Asset Twin', 'Smart Meter Lane', 'Telemetry History', 'Anomaly Queue', 'Manager Action Board'],
    agentLoops: ['validate readings', 'flag anomalies', 'summarize energy movement', 'draft maintenance actions'],
    route: '/app/factory-operations',
    proof: 'A real digital twin wedge lets SuperMega sell operational visibility, not just dashboards or generic AI chat.',
  },
  {
    id: 'restaurant-group-os',
    name: 'Restaurant POS + Inventory',
    buyer: 'Restaurant, cafe, retail, or service-counter owner',
    useWhen: 'Menus, provider payment proof, shifts, stock, customer issues, and daily close are handled in chat or paper.',
    firstWorkflow: 'Item/order setup, provider payment proof, and daily cash-up control with reviewed reconciliation.',
    modules: ['menu and items', 'orders and payments', 'cash-up close', 'shift board', 'stock/prep', 'owner report'],
    agentLoops: ['item extraction', 'cash-up reconciliation', 'payment exception review', 'daily owner summary'],
    route: '/app/restaurant-pos',
    proof: 'Good Myanmar small-business wedge because payment proof, settlement status, and owner review are visible immediately.',
  },
  {
    id: 'workspace-builder',
    name: 'Workspace Setup',
    buyer: 'SuperMega delivery team and tenant admins',
    useWhen: 'A prospect needs a custom portal assembled from roles, data sources, modules, AI actions, and review gates.',
    firstWorkflow: 'Convert client intake into a manifest and launch checklist.',
    modules: ['Client intake', 'Role map', 'Module manifest', 'AI action registry', 'Go-live QA'],
    agentLoops: ['module matching', 'gap analysis', 'route coverage audit', 'launch task generation'],
    route: '/app/portal-factory',
    proof: 'This is how the platform scales beyond hand-built one-off builds.',
  },
]

export const ENTERPRISE_AGENT_WORKFLOWS: EnterpriseAgentWorkflow[] = [
  {
    id: 'ai-workflow-desk-loop',
    name: 'Back Office Workflow Desk Operating Packet',
    trigger: 'A client submits one repeated workflow and source sample.',
    agents: ['Intake analyst', 'source cleaner', 'workflow architect', 'browser operator', 'QA auditor'],
    tools: ['source register', 'work queue', 'approval policy', 'browser-step checklist', 'evidence pack'],
    outputs: ['workflow map', 'clean source preview', 'prepared work queue', 'approval packet', 'proof pack'],
    reviewGate: 'Human approves external sends, browser writeback, billing, client claims, and policy changes.',
    metric: 'Days from workflow sample to reviewed useful desk',
    route: '/app/documents',
  },
  {
    id: 'cloud-agent-army-loop',
    name: 'Hosted Operations Workcells',
    trigger: 'A lead, workflow packet, build packet, QA failure, or proof-pack milestone enters the cloud queue.',
    agents: ['Growth scanner', 'intake mapper', 'solution architect', 'builder pod', 'QA auditor', 'proof writer'],
    tools: ['Vercel Workflow', 'Cloud Tasks queue', 'agent run ledger', 'approval records', 'release gate'],
    outputs: ['lead packet', 'workflow scope', 'build packet', 'QA report', 'proof pack', 'expansion proposal'],
    reviewGate: 'No outbound publishing, billing, production deploy, external writeback, credentialed browser action, or claim without approval.',
    metric: 'Approved work packets moved per week toward the 100k revenue path',
    route: '/app/cloud-agent-army',
  },
  {
    id: 'source-intake',
    name: 'Source Intake Agent',
    trigger: 'A file, email, upload, export, or form changes.',
    agents: ['Classifier', 'Extractor', 'Data-quality reviewer'],
    tools: ['Drive/Gmail/Sheets connector', 'source ledger', 'entity extractor'],
    outputs: ['Changed-source queue', 'canonical record proposal', 'missing evidence flags'],
    reviewGate: 'Data owner confirms ambiguous records before promotion.',
    metric: 'Unreviewed source changes',
    route: '/app/data-fabric',
  },
  {
    id: 'module-designer',
    name: 'Module Designer Agent',
    trigger: 'A client intake names a repeated workflow pain.',
    agents: ['Workflow mapper', 'standards mapper', 'UI module drafter'],
    tools: ['Workspace Setup', 'module registry', 'standards library'],
    outputs: ['Module contract', 'role view', 'AI action spec', 'smoke plan'],
    reviewGate: 'Implementation lead approves route, capability, and first workflow.',
    metric: 'Days from intake to usable module',
    route: '/app/portal-factory',
  },
  {
    id: 'operator-coach',
    name: 'Operator Coach Agent',
    trigger: 'A manager opens a role home or queue.',
    agents: ['Brief writer', 'missing-evidence checker', 'next-action recommender'],
    tools: ['task queue', 'KPI records', 'evidence ledger'],
    outputs: ['Today brief', 'next action', 'approval packet draft'],
    reviewGate: 'Human owns the final action and closeout.',
    metric: 'Time to first action',
    route: '/app/start',
  },
  {
    id: 'release-qa',
    name: 'Release QA Agent',
    trigger: 'A portal, route, module, or domain changes.',
    agents: ['Route auditor', 'auth boundary checker', 'mobile smoke tester'],
    tools: ['Vercel deployment state', 'Playwright', 'smoke scripts'],
    outputs: ['QA run', 'failure list', 'cleanup report', 'release evidence'],
    reviewGate: 'Platform admin reviews failures before client sharing.',
    metric: 'Green release ratio',
    route: '/app/meta-ops',
  },
]

export const PLATFORM_OPERATING_SCORECARD: PlatformOperatingScore[] = [
  {
    id: 'client-clarity',
    area: 'Client clarity',
    score: 86,
    evidence: 'The entry flow now starts at app.supermega.dev and offers concrete product proof routes instead of a route map.',
    nextBuild: 'Add a one-click proof script and short video capture for each portal.',
    route: '/login?next=/app/start',
  },
  {
    id: 'module-depth',
    area: 'Module depth',
    score: 82,
    evidence: 'The product stack is now factory-first: Factory Operations App for records, Factory Live State for live state, Factory Operations Pack for quality/maintenance/receiving, and Restaurant POS + Inventory as the local-market side wedge.',
    nextBuild: 'Back Factory Operations App, CAPA, maintenance, receiving, and Source Intake with tenant-safe persistent records and audit history.',
    route: '/app/product-ops',
  },
  {
    id: 'agent-governance',
    area: 'Agent governance',
    score: 82,
    evidence: 'Agent loops have tool scope, review gates, and QA smoke coverage, but traces need more durable artifacts.',
    nextBuild: 'Persist tool calls, source citations, eval result, reviewer, and rollback note per agent run.',
    route: '/app/teams',
  },
  {
    id: 'delivery-scalability',
    area: 'Delivery scalability',
    score: 80,
    evidence: 'Workspace Setup can assemble manifests, but package-to-deployment automation should become more repeatable.',
    nextBuild: 'Generate launch tasks, proof script, route smoke, and client checklist from one manifest.',
    route: '/app/portal-factory',
  },
]
