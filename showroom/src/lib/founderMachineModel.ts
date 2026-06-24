export type FounderProductLine = {
  id: string
  name: string
  buyer: string
  categoryToReplace: string
  wedge: string
  firstRoute: string
  dataInputs: string[]
  agentCrew: string[]
  sellablePack: string
  nextBuild: string
  gate: string
  score: number
}

export type FounderOperatingLoop = {
  id: string
  name: string
  founderJob: string
  autonomousUpgrade: string
  sourceOfTruth: string
  reviewGate: string
  route: string
  cadence: string
}

export type FounderAgentRole = {
  id: string
  name: string
  replacesFounderWork: string
  reads: string[]
  produces: string[]
  writes: string
  route: string
}

export type FounderMachineGate = {
  id: string
  name: string
  requiredEvidence: string[]
  blocks: string
  unlocks: string
}

export type FounderBillionThesis = {
  name: string
  decision: string
  beachhead: string
  wedge: string
  notThis: string[]
  moat: string[]
  agentRuntime: string[]
  revenuePath: string[]
}

export type FounderBillionScaleStep = {
  id: string
  stage: string
  target: string
  product: string
  proof: string
  scaleMechanic: string
}

export const FOUNDER_BILLION_THESIS: FounderBillionThesis = {
  name: 'Agentic Operations Twin Platform',
  decision:
    'SuperMega should become the AI-native operating layer for real businesses: ingest messy sources, build a live operations twin, assign agent crews, and let owners approve high-value actions from one calm workspace.',
  beachhead:
    'Factories, distributors, restaurants, service businesses, and owner-led SMEs where work already lives in Drive, spreadsheets, WhatsApp, email, PDFs, machines, and scattered SaaS exports.',
  wedge:
    'Operations Digital Twin + Back Office Workflow Desk + Source Room: one painful workflow becomes one working screen with source evidence, role ownership, approval gates, and a repeatable module contract.',
  notThis: [
    'A broad SaaS clone marketplace before one operating loop is proven.',
    'A chatbot wrapper that cannot read source systems or execute controlled work.',
    'A custom agency that ships one-off dashboards with no reusable module contract.',
    'An unsafe autonomous worker that writes to clients, payments, or production without approval.',
  ],
  moat: [
    'Tenant source contracts that normalize messy operating data into trusted KPI and task objects.',
    'Role-specific operations twins that turn the same source layer into owner, manager, finance, sales, and support workspaces.',
    'Agent run ledgers with evidence, approvals, rollback paths, and forbidden-action policies.',
    'Reusable vertical templates for factory, service, retail, distribution, and client-delivery operations.',
    'A module factory that converts every client proof into another sellable software primitive.',
  ],
  agentRuntime: [
    'Vercel workflow lanes for durable multi-step jobs, retries, approvals, and release packaging.',
    'Stateful agent rooms for always-on watches, source-change memory, scheduled checks, and realtime operator status.',
    'Codex builder lanes for bounded code changes, tests, audits, and product-route hardening.',
    'MCP and OAuth connector lanes for read-first data access, staged writebacks, and audit evidence.',
  ],
  revenuePath: [
    'Paid first-screen sprint: prove one workflow with one data source and one approval gate.',
    'Managed pilot: connect recurring sources, role workspaces, daily owner brief, and QA cadence.',
    'Recurring workspace: charge monthly for hosted agent operations, support, connectors, and improvements.',
    'Vertical template network: turn repeated workflows into packaged modules and partner-deliverable playbooks.',
  ],
}

export const FOUNDER_BILLION_SCALE_STEPS: FounderBillionScaleStep[] = [
  {
    id: 'ten-paid-proofs',
    stage: 'Proof',
    target: '10 paid first screens',
    product: 'Back Office Workflow Desk plus Source Room',
    proof: 'Each customer sends one messy source and receives one usable screen with evidence.',
    scaleMechanic: 'Keep scope tiny, priced, and measurable so sales learning compounds quickly.',
  },
  {
    id: 'hundred-workflow-maps',
    stage: 'Repeatability',
    target: '100 workflow maps',
    product: 'Source register and module contract library',
    proof: 'Every lead is classified by buyer, source type, workflow pain, agent crew, and approval risk.',
    scaleMechanic: 'The same intake structure makes sales, implementation, QA, and training repeatable.',
  },
  {
    id: 'vertical-ops-twins',
    stage: 'Verticalization',
    target: '5 vertical operations twins',
    product: 'Factory, service, retail, distribution, and agency operations twins',
    proof: 'Each vertical has role screens, source contracts, KPI objects, agent jobs, and handoff SOPs.',
    scaleMechanic: 'Vertical templates lower delivery cost while keeping the client workspace custom.',
  },
  {
    id: 'hosted-agent-workforce',
    stage: 'Cloud workforce',
    target: 'Always-on approved agent lanes',
    product: 'Cloud Agent Army',
    proof: 'Runs, evidence, approvals, and blocked actions are visible before any external write.',
    scaleMechanic: 'Agents become the service margin engine, not just demo features.',
  },
  {
    id: 'platform-network',
    stage: 'Platform',
    target: '$1B-scale recurring software path',
    product: 'Agentic Operations Twin Platform',
    proof: 'Many tenants run on the same source contracts, workflow primitives, agent ledger, and module marketplace.',
    scaleMechanic: 'Custom onboarding becomes data for reusable products; reusable products make custom onboarding faster.',
  },
]

export const FOUNDER_PRODUCT_LINES: FounderProductLine[] = [
  {
    id: 'agentic-operations-twin-platform',
    name: 'Agentic Operations Twin Platform',
    buyer: 'Owner, COO, plant manager, operator-led executive team',
    categoryToReplace: 'SAP Business One, Odoo, generic BI, disconnected workflow tools, manual operator review',
    wedge: 'A live business twin that reads messy sources, shows the few decisions that matter, and dispatches approval-gated agent crews to prepare the work.',
    firstRoute: '/app/operations-twin',
    dataInputs: ['Drive', 'Sheets', 'ERP exports', 'machine logs', 'email', 'forms', 'uploaded files'],
    agentCrew: ['Source Cartographer', 'KPI Analyst', 'Workflow Builder', 'Approval Guard'],
    sellablePack: 'Operations twin sprint for real-world businesses with messy data.',
    nextBuild: 'Make every client intake produce a source contract, workflow map, first screen, and reusable module candidate.',
    gate: 'No automation scales until source evidence, role owner, approval policy, and rollback path are visible.',
    score: 97,
  },
  {
    id: 'autonomous-company-os',
    name: 'Autonomous Company OS',
    buyer: 'Founder, owner-operator, small executive team',
    categoryToReplace: 'Founder admin work, scattered dashboards, manual daily review',
    wedge: 'One page that turns tasks, leads, domains, releases, and agent runs into the few decisions the founder must make today.',
    firstRoute: '/app/founder-machine',
    dataInputs: ['workspace tasks', 'agent runs', 'domain smoke', 'release QA', 'growth queue'],
    agentCrew: ['Founder Chief of Staff', 'Release Guard', 'Growth Operator'],
    sellablePack: 'Founder operating system for companies run by one overloaded owner.',
    nextBuild: 'Persist founder decisions as owned tasks and release bets with an evidence contract.',
    gate: 'No autonomous action without owner, source, approval state, rollback, and next check.',
    score: 91,
  },
  {
    id: 'agency-delivery-os',
    name: 'Agency Delivery OS',
    buyer: 'Agency founder, consultant, support lead',
    categoryToReplace: 'Asana, Monday, client portals, manual meeting follow-up',
    wedge: 'Client requests, meeting actions, proposals, approvals, and billing readiness in one delivery queue.',
    firstRoute: '/app/service-desk',
    dataInputs: ['Gmail', 'Drive', 'Calendar', 'Docs', 'Stripe'],
    agentCrew: ['Client Delivery Analyst', 'Meeting Clerk', 'Billing Prep'],
    sellablePack: 'Client delivery control sprint.',
    nextBuild: 'Convert meeting notes and inbox threads into client-ready next actions.',
    gate: 'Client-facing messages remain draft-only until approved.',
    score: 86,
  },
  {
    id: 'service-retail-desk',
    name: 'Service Retail Desk',
    buyer: 'Spa, clinic, salon, repair, and service retail owner',
    categoryToReplace: 'POS add-ons, daily accounting spreadsheets, paper bookings',
    wedge: 'One-location sales, appointments, daily close, owner brief, and cloud continuity.',
    firstRoute: '/app/service-desk',
    dataInputs: ['daily sales', 'appointments', 'staff notes', 'expense records', 'cloud backup'],
    agentCrew: ['Daily Close Clerk', 'Owner Brief', 'Service Recovery Watch'],
    sellablePack: 'Simple desk system for owner-led service businesses.',
    nextBuild: 'Generalize the spa POS wedge into a reusable service-retail module kit.',
    gate: 'Never store customer payment secrets in the SuperMega platform registry.',
    score: 84,
  },
  {
    id: 'ai-workspace-suite',
    name: 'AI Workspace Suite',
    buyer: 'Any team drowning in Google Workspace or Microsoft 365 sprawl',
    categoryToReplace: 'Google Workspace, Microsoft 365, Notion, shared drives',
    wedge: 'Company memory, document control, decision journal, and role-specific knowledge packs.',
    firstRoute: '/app/knowledge',
    dataInputs: ['Drive', 'Docs', 'Sheets', 'Gmail', 'meeting notes'],
    agentCrew: ['Knowledge Curator', 'Decision Clerk', 'Source Watch'],
    sellablePack: 'Company memory cleanup and AI-readiness sprint.',
    nextBuild: 'Attach source-change tracking to document canon and retrieval quality scores.',
    gate: 'Every answer needs a source reference and sensitive-field policy.',
    score: 82,
  },
  {
    id: 'ai-crm-revenue-os',
    name: 'AI CRM and Revenue OS',
    buyer: 'Founder-led sales team, distributor, B2B service operator',
    categoryToReplace: 'Salesforce, HubSpot, Pipedrive, sales spreadsheets',
    wedge: 'Lead finding, account cleanup, follow-up queue, and founder revenue brief.',
    firstRoute: '/app/revenue/growth',
    dataInputs: ['website leads', 'Gmail', 'Sheets', 'company lists', 'proposal docs'],
    agentCrew: ['Revenue Scout', 'List Clerk', 'Founder Brief'],
    sellablePack: 'Revenue workspace for owner-led sales teams.',
    nextBuild: 'Tie one approved outbound loop to lead ledger, unsubscribe posture, and reply review.',
    gate: 'Human approval before any outbound message or CRM writeback.',
    score: 80,
  },
  {
    id: 'industrial-ops-os',
    name: 'Industrial Operations OS',
    buyer: 'Factory owner, plant manager, quality lead',
    categoryToReplace: 'Odoo, SAP Business One, QMS/DQMS suites, spreadsheet KPI reviews',
    wedge: 'Daily plant brief, receiving control, DQMS, maintenance, supplier recovery, and owner review.',
    firstRoute: '/app/plant-manager',
    dataInputs: ['ERP exports', 'Drive', 'Gmail', 'quality records', 'maintenance logs'],
    agentCrew: ['Ops Watch', 'Quality Architect', 'Supplier Recovery Pod'],
    sellablePack: 'Factory daily control sprint.',
    nextBuild: 'Promote Factory Client proof into a repeatable industrial tenant kit.',
    gate: 'Operational writes require tenant role, source evidence, approval path, and rollback.',
    score: 89,
  },
]

export const FOUNDER_OPERATING_LOOPS: FounderOperatingLoop[] = [
  {
    id: 'signal-intake',
    name: 'Signal intake',
    founderJob: 'Notice customer pain, repo drift, deploy failures, route gaps, and sales opportunities.',
    autonomousUpgrade: 'Agents sweep tasks, product gaps, source changes, domain smoke, and lead queues into a ranked opportunity board.',
    sourceOfTruth: 'Process report, system audit, growth queue, live domain smoke, workspace tasks',
    reviewGate: 'Founder approves which signal becomes a product bet.',
    route: '/app/process',
    cadence: 'Hourly checks plus daily founder brief',
  },
  {
    id: 'product-selection',
    name: 'Product selection',
    founderJob: 'Decide which SaaS category or customer workflow to copy, compress, and improve.',
    autonomousUpgrade: 'The machine scores products by buyer pain, reusable module potential, available data, and proof route readiness.',
    sourceOfTruth: 'Product Ops, SaaS module machine, software catalog, tenant proofs',
    reviewGate: 'Only build products with buyer, first route, data inputs, agent crew, and release gate.',
    route: '/app/product-ops',
    cadence: 'Twice-weekly product review',
  },
  {
    id: 'build-dispatch',
    name: 'Build dispatch',
    founderJob: 'Tell Codex what to build, inspect files, make routes, run tests, and keep moving.',
    autonomousUpgrade: 'Founder Machine converts product bets into build packets, route work, audits, and agent evidence requirements.',
    sourceOfTruth: 'Build Studio, Foundry, Portal Factory, AGENTS guidance, skills, MCP tools',
    reviewGate: 'No deploy until build, route export, product audit, and evidence audit pass.',
    route: '/app/factory',
    cadence: 'Continuous during active build',
  },
  {
    id: 'release-control',
    name: 'Release control',
    founderJob: 'Run QA, deploy, inspect live domains, fix broken checks, and summarize status.',
    autonomousUpgrade: 'Release Guard runs the same release story every time and blocks stale tests or wrong Vercel project links.',
    sourceOfTruth: 'qa:release, smoke:domains, smoke:cloud-autonomy, smoke:process-cloud, route audit',
    reviewGate: 'Production alias is trusted only after live smoke and rollback path are recorded.',
    route: '/app/cloud',
    cadence: 'Every deploy and every daily cloud review',
  },
  {
    id: 'distribution-learning',
    name: 'Distribution learning',
    founderJob: 'Turn proof into sales copy, offers, prospect lists, follow-up, and product feedback.',
    autonomousUpgrade: 'Growth Operator turns products into approved outreach queues and feeds replies back into the module factory.',
    sourceOfTruth: 'Growth Machine, lead ledger, public contact status, productized offers',
    reviewGate: 'No direct outreach until approval, unsubscribe, rate-limit, and audit posture are green.',
    route: '/app/revenue/growth',
    cadence: 'Daily queue generation with weekly copy review',
  },
]

export const FOUNDER_AGENT_ROLES: FounderAgentRole[] = [
  {
    id: 'founder-chief-of-staff',
    name: 'Founder Chief of Staff',
    replacesFounderWork: 'Morning prioritization, scattered updates, and deciding what deserves attention.',
    reads: ['process reports', 'workspace tasks', 'agent runs', 'release status'],
    produces: ['daily founder brief', 'priority shifts', 'decision queue'],
    writes: 'Drafts tasks and briefs; founder approves escalations.',
    route: '/app/meta',
  },
  {
    id: 'product-scout',
    name: 'Product Scout',
    replacesFounderWork: 'Looking at every SaaS category and guessing what to build next.',
    reads: ['customer pain', 'incumbent maps', 'module catalog', 'tenant proof gaps'],
    produces: ['product bets', 'module briefs', 'wedge rankings'],
    writes: 'Creates candidate build packets only after product gates are present.',
    route: '/app/product-ops',
  },
  {
    id: 'codex-build-producer',
    name: 'Codex Build Producer',
    replacesFounderWork: 'Turning broad ideas into file-level implementation work and verification commands.',
    reads: ['AGENTS guidance', 'repo routes', 'skills', 'MCP/tool availability'],
    produces: ['build plan', 'audit requirements', 'handoff notes'],
    writes: 'Queues build tasks; code changes still go through QA and release gates.',
    route: '/app/foundry',
  },
  {
    id: 'release-guard',
    name: 'Release Guard',
    replacesFounderWork: 'Remembering which tests, deploys, aliases, and smoke checks need to pass.',
    reads: ['qa:release', 'domain contract', 'route audit', 'cloud autonomy'],
    produces: ['release verdict', 'rollback warning', 'verification brief'],
    writes: 'Blocks unsafe deploy promotion and records evidence.',
    route: '/app/cloud',
  },
  {
    id: 'growth-operator',
    name: 'Growth Operator',
    replacesFounderWork: 'Turning product progress into offers, target lists, and follow-up loops.',
    reads: ['productized offers', 'lead ledger', 'public contact status', 'customer objections'],
    produces: ['approved campaign queue', 'reply learnings', 'offer revisions'],
    writes: 'Stages outbound and content drafts for approval.',
    route: '/app/revenue/growth',
  },
  {
    id: 'customer-success-analyst',
    name: 'Customer Success Analyst',
    replacesFounderWork: 'Remembering what every client needs next and which product gaps are real.',
    reads: ['tenant usage', 'support queue', 'operator notes', 'approval gaps'],
    produces: ['adoption risks', 'support packets', 'product feedback'],
    writes: 'Creates review tasks and support follow-up drafts.',
    route: '/app/adoption-command',
  },
]

export const FOUNDER_MACHINE_GATES: FounderMachineGate[] = [
  {
    id: 'source-gate',
    name: 'Source gate',
    requiredEvidence: ['input scope', 'source refs', 'data owner'],
    blocks: 'Agents inventing or acting on stale context.',
    unlocks: 'Trusted analysis, source-aware briefs, and customer-safe recommendations.',
  },
  {
    id: 'writeback-gate',
    name: 'Writeback gate',
    requiredEvidence: ['approval state', 'risk level', 'rollback path', 'write policy'],
    blocks: 'Uncontrolled customer-system mutation, outbound messages, or production actions.',
    unlocks: 'Reviewed automation that can safely prepare or perform bounded writes.',
  },
  {
    id: 'release-gate',
    name: 'Release gate',
    requiredEvidence: ['build result', 'route audit', 'domain smoke', 'cloud autonomy smoke'],
    blocks: 'Local-only work being mistaken for a live product.',
    unlocks: 'Deployable, provable, supportable product increments.',
  },
  {
    id: 'commercial-gate',
    name: 'Commercial gate',
    requiredEvidence: ['buyer', 'first value', 'proof route', 'setup checklist'],
    blocks: 'Building generic SaaS clones that cannot be sold or onboarded.',
    unlocks: 'Productized offers that can be repeated across customers.',
  },
]

export const FOUNDER_MACHINE_PRINCIPLES = [
  'The billion-scale company is not every SaaS clone at once; it is one agentic operations twin platform that turns messy real work into reusable software primitives.',
  'The founder loop is a product: signals in, product bets selected, agents dispatched, releases verified, market feedback learned.',
  'Do not copy SaaS screens directly; copy the valuable operator job, compress it into one route, then attach data and agents.',
  'Every autonomous loop needs evidence, approval, rollback, and a human-visible owner before it writes to the outside world.',
  'Every new product line needs a buyer, wedge, source inputs, agent crew, release gate, and proof route before it enters the portfolio.',
] as const
