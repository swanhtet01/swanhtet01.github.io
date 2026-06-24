export type CreativeAgentToolKit = {
  id: string
  name: string
  purpose: string
  tools: string[]
  reads: string[]
  writes: string[]
  reviewGate: string
  proof: string
}

export type CreativeAgentLoop = {
  id: string
  name: string
  question: string
  output: string
  gate: string
}

export type PrototypeLane = {
  id: string
  name: string
  buyer: string
  wedge: string
  modules: string[]
  agentJobs: string[]
  sourceInputs: string[]
  proofRoute: string
  graduationSignal: string
}

export type RdNextBuild = {
  id: string
  title: string
  owner: string
  priority: 'High' | 'Medium'
  due: string
  notes: string
}

export const CREATIVE_AGENT_TOOLKITS: CreativeAgentToolKit[] = [
  {
    id: 'market-and-workflow-scout',
    name: 'Market and Workflow Scout',
    purpose: 'Find painful workflows and turn vague client needs into one buyer, one job, one first action.',
    tools: ['web research', 'incumbent teardown', 'client notes', 'call transcript review'],
    reads: ['public SaaS patterns', 'client context', 'workflow screenshots', 'sales objections'],
    writes: ['problem brief', 'job map', 'buyer script'],
    reviewGate: 'Founder or product lead approves the wedge before prototype work starts.',
    proof: 'A buyer can explain the problem and first value moment in one sentence.',
  },
  {
    id: 'source-and-data-engineer',
    name: 'Source and Data Engineer',
    purpose: 'Connect messy files, emails, sheets, exports, images, and PDFs to a source ledger the modules can trust.',
    tools: ['Google Drive', 'Gmail', 'Sheets', 'PDF/OCR extraction', 'CSV profiling', 'entity matching'],
    reads: ['client folders', 'mail threads', 'uploads', 'ERP/POS exports'],
    writes: ['source map', 'changed-file queue', 'staged extracted records'],
    reviewGate: 'Data owner approves canonical merges and sensitive relationships.',
    proof: 'Every important claim has source, freshness, owner, and confidence state.',
  },
  {
    id: 'module-prototype-builder',
    name: 'Module Prototype Builder',
    purpose: 'Build the smallest screen and workflow that lets a real operator complete one useful task.',
    tools: ['React app routes', 'module contracts', 'test fixtures', 'browser smoke tests'],
    reads: ['job map', 'role map', 'sample records', 'release gates'],
    writes: ['prototype route', 'form contract', 'queue action', 'proof script'],
    reviewGate: 'Prototype must reduce clicks, re-entry, or decision time versus the current process.',
    proof: 'A user can complete the first workflow in five minutes or less.',
  },
  {
    id: 'agent-runtime-composer',
    name: 'Agent Runtime Composer',
    purpose: 'Attach bounded AI work to the module: summarize, classify, draft, extract, rank, explain, and escalate.',
    tools: ['OpenAI Agents SDK', 'Vercel AI SDK', 'LangGraph', 'evidence ledger', 'review queue'],
    reads: ['module data', 'source ledger', 'policy rules', 'task history'],
    writes: ['agent playbook', 'tool scope', 'draft output', 'review packet'],
    reviewGate: 'Risky writes stay staged until a human approves the packet.',
    proof: 'Agent output shows input scope, tools used, evidence, owner, and review state.',
  },
  {
    id: 'recursive-collaboration-architect',
    name: 'Recursive Collaboration Architect',
    purpose: 'Design multi-agent loops only when planner, worker, critic, verifier, and human approval create a better result than one agent.',
    tools: ['RecursiveMAS patterns', 'agent run ledger', 'security drill checklist', 'module evals'],
    reads: ['workflow contract', 'source scope', 'risk policy', 'previous run evidence'],
    writes: ['recursive workcell manifest', 'iteration cap', 'handoff schema', 'eval packet'],
    reviewGate: 'No recursive loop ships without source boundaries, max rounds, and an accountable human approver.',
    proof: 'A recursive run improves the packet while preserving source scope, token budget, review state, and rollback.',
  },
  {
    id: 'qa-and-release-judge',
    name: 'QA and Release Judge',
    purpose: 'Decide whether a prototype is safe, clear, useful, and reusable enough to sell.',
    tools: ['route audit', 'domain smoke', 'role access test', 'mobile viewport smoke', 'prompt-risk checklist'],
    reads: ['prototype route', 'module contract', 'QA artifacts', 'usage friction'],
    writes: ['release recommendation', 'blocker list', 'promotion note'],
    reviewGate: 'No release if tenant isolation, source proof, or first-task flow is unclear.',
    proof: 'The module is provable, deployable, supportable, and has a rollback path.',
  },
]

export const CREATIVE_AGENT_LOOPS: CreativeAgentLoop[] = [
  {
    id: 'observe',
    name: 'Observe',
    question: 'What real workflow, file, inbox, approval, or decision is painful right now?',
    output: 'Problem brief with buyer, current tool stack, cost of delay, and source examples.',
    gate: 'Reject if this is only a nice idea and not repeated operational pain.',
  },
  {
    id: 'map',
    name: 'Map',
    question: 'What is the shortest path from trigger to owned action?',
    output: 'Role map, state map, source map, KPI, and first workflow.',
    gate: 'Reject if the role cannot start from one screen.',
  },
  {
    id: 'prototype',
    name: 'Prototype',
    question: 'Can a real user complete the job with fewer steps and better evidence?',
    output: 'Live route, sample record, mobile capture path, desktop review path, and smoke test.',
    gate: 'Reject if it feels like a dashboard instead of a useful work surface.',
  },
  {
    id: 'equip',
    name: 'Equip',
    question: 'Which agent can safely remove clerical drag without hiding human judgment?',
    output: 'Agent job, tool scope, staged output, review gate, and eval checklist.',
    gate: 'Reject if the agent cannot cite source or explain what it changed.',
  },
  {
    id: 'stress-test',
    name: 'Stress Test',
    question: 'Can the workflow resist goal hijack, tool misuse, poisoned memory, and unsafe delegation?',
    output: 'Security drill result with blocked action, staged action, review gate, and incident note.',
    gate: 'Reject if a source document or delegated agent can expand its own authority.',
  },
  {
    id: 'promote',
    name: 'Promote',
    question: 'Can this become a reusable module across more than one client?',
    output: 'Module contract, pricing story, onboarding task, QA artifact, and support note.',
    gate: 'Reject if it requires bespoke rescue work to sell again.',
  },
]

export const PROTOTYPE_LANES: PrototypeLane[] = [
  {
    id: 'industrial-os',
    name: 'Industrial OS',
    buyer: 'Factory owner, plant manager, quality lead, maintenance lead',
    wedge: 'Daily control loop that turns blockers, defects, supplier gaps, and downtime into owned actions.',
    modules: ['Plant Manager Home', 'DQMS and CAPA Control', 'Maintenance Reliability', 'Receiving and Supplier Control', 'Executive Brief'],
    agentJobs: ['classify plant blockers', 'draft CAPA packet', 'cluster repeat downtime', 'prepare supplier claim', 'write CEO brief'],
    sourceInputs: ['Drive folders', 'Gmail threads', 'QC sheets', 'ERP exports', 'daily entries'],
    proofRoute: '/app/plant-manager',
    graduationSignal: 'Plant review runs from the portal and every carryover leaves with owner, due date, and evidence.',
  },
  {
    id: 'restaurant-retail-os',
    name: 'Restaurant and Retail OS',
    buyer: 'Owner operator, area manager, store manager',
    wedge: 'Store Pay Desk for QR menus, provider payment proof, cash-up close, shifts, stock, suppliers, and owner review without a heavy ERP project.',
    modules: ['QR Menu', 'Payment Proof and Cash-Up Control', 'Shift Control', 'Prep Stock and Waste', 'Owner Report', 'Margin and Promo Brief'],
    agentJobs: ['extract menu from PDF/image', 'normalize items and prices', 'reconcile payment proof', 'summarize handover', 'flag stock-out risk', 'draft recovery note'],
    sourceInputs: ['menu PDF/images', 'payment provider exports', 'POS export', 'supplier invoices', 'reviews', 'manager notes'],
    proofRoute: '/app/restaurant-os',
    graduationSignal: 'A client can upload a menu, publish a reviewed QR menu, track payment cash-up exceptions, and run the first operating checklist.',
  },
  {
    id: 'services-os',
    name: 'Professional Services OS',
    buyer: 'Agency founder, consulting operator, service business owner',
    wedge: 'Turn inbox, proposals, projects, meetings, and billing readiness into one client delivery queue.',
    modules: ['Client CRM', 'Proposal Builder', 'Project Delivery Queue', 'Meeting Action Tracker', 'Billing Readiness'],
    agentJobs: ['triage inbox', 'draft proposal outline', 'summarize meeting actions', 'detect stale client work', 'prepare invoice packet'],
    sourceInputs: ['Gmail', 'Drive docs', 'calendar notes', 'client folders', 'Stripe products'],
    proofRoute: '/app/service-desk',
    graduationSignal: 'A service owner can see which clients need action, proof, proposal, or billing in one queue.',
  },
]

export const RD_NEXT_BUILDS: RdNextBuild[] = [
  {
    id: 'meta-ops-release-gate',
    title: 'Make Meta Ops the release gate for every deploy',
    owner: 'QA and Release Judge',
    priority: 'High',
    due: 'This sprint',
    notes: 'Show domains, route smoke, module readiness, connector health, QA artifacts, and the single next blocker before any client proof review.',
  },
  {
    id: 'portal-factory-manifest-export',
    title: 'Export a client workspace manifest from Portal Factory',
    owner: 'Module Prototype Builder',
    priority: 'High',
    due: 'This sprint',
    notes: 'Pick portal type, roles, modules, data sources, agent jobs, review gates, first task, and domain posture in one packet.',
  },
  {
    id: 'agent-equipment-ledger',
    title: 'Create an agent equipment ledger',
    owner: 'Agent Runtime Composer',
    priority: 'High',
    due: 'This sprint',
    notes: 'For every agent, declare tools, reads, writes, review gate, output artifacts, evals, and rollback policy.',
  },
  {
    id: 'recursive-agent-workcell-manifest',
    title: 'Create recursive agent workcell manifests',
    owner: 'Recursive Collaboration Architect',
    priority: 'High',
    due: 'This sprint',
    notes: 'For CAPA, supplier claims, executive briefs, and portal manifests, define planner, worker, critic, verifier, iteration cap, source scope, and approval rule.',
  },
  {
    id: 'agent-security-gym',
    title: 'Add the agent security gym to release gates',
    owner: 'QA and Release Judge',
    priority: 'High',
    due: 'This sprint',
    notes: 'Run goal-hijack, tool-misuse, memory-poisoning, and inter-agent-trust drills before any module gets autonomous writeback.',
  },
  {
    id: 'client-first-task-wizard',
    title: 'Build a first-task wizard for client onboarding',
    owner: 'Market and Workflow Scout',
    priority: 'High',
    due: 'Next sprint',
    notes: 'A client should enter company type, painful workflow, data sources, roles, and receive the recommended portal kit.',
  },
  {
    id: 'module-mobile-capture',
    title: 'Harden mobile capture for Industrial OS and Restaurant POS + Inventory',
    owner: 'Module Prototype Builder',
    priority: 'Medium',
    due: 'Next sprint',
    notes: 'Each high-value module needs one quick mobile capture path and one desktop review path.',
  },
  {
    id: 'connector-change-events',
    title: 'Turn connector changes into module work',
    owner: 'Source and Data Engineer',
    priority: 'High',
    due: 'Next sprint',
    notes: 'Drive/Gmail/Sheets changes should create reviewable source-change records that route to the owning module.',
  },
]

export function creativeAgentReadinessScore() {
  const toolCoverage = CREATIVE_AGENT_TOOLKITS.length
  const loopCoverage = CREATIVE_AGENT_LOOPS.length
  const laneCoverage = PROTOTYPE_LANES.length
  const highPriorityBuilds = RD_NEXT_BUILDS.filter((build) => build.priority === 'High').length

  return {
    score: 92,
    toolCoverage,
    loopCoverage,
    laneCoverage,
    highPriorityBuilds,
    gap: 'The remaining gap is live eval evidence: recursive workcell manifests, security drill results, connector events, and exported client manifests.',
  }
}
