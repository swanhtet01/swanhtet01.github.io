export type AgenticUnitStatus = 'sell-now' | 'pilot' | 'build-next' | 'research'

export type AgentFrameworkStatus = 'adopt-now' | 'prototype' | 'watch' | 'blocked'

export type AgenticUnitVisibility = 'public-offer' | 'private-pilot' | 'internal-machine' | 'included-module'

export type AgenticOperationUnit = {
  id: string
  name: string
  status: AgenticUnitStatus
  visibility: AgenticUnitVisibility
  buyer: string
  firstWorkflow: string
  sourceContracts: string[]
  modules: string[]
  agentCrew: string[]
  approvalGate: string
  proofRoute: string
  appRoute: string
  qaScript: string
  revenueOffer: string
  promotionState: string
}

export type PrivateClientProof = {
  id: string
  name: string
  tenantHost: string
  visibility: 'private-client-proof'
  client: string
  purpose: string
  sourceBoundary: string
  privateRule: string
  proofRoute: string
  appRoute: string
  reusableTemplate: string
  blockedPublicClaims: string[]
}

export type AgentCompanyWorkcell = {
  id: string
  name: string
  mission: string
  agents: string[]
  tools: string[]
  allowedActions: string[]
  blockedActions: string[]
  evidence: string[]
  ownerRoute: string
}

export type AgentFrameworkLane = {
  id: string
  name: string
  status: AgentFrameworkStatus
  role: string
  useFor: string
  packageOrRepo: string
  sourceUrl: string
  guardrail: string
}

export type AgentCompanyPolicy = {
  id: string
  rule: string
  blocks: string[]
  unlocks: string
}

export const AGENTIC_OPERATIONS_REGISTRY: AgenticOperationUnit[] = [
  {
    id: 'operations-twin',
    name: 'Factory Operations App',
    status: 'sell-now',
    visibility: 'public-offer',
    buyer: 'Factory owner, COO, plant manager, facilities lead, distributor operator',
    firstWorkflow: 'One factory issue, meter reading, receiving gap, maintenance risk, or manager decision becomes one daily control screen.',
    sourceContracts: ['asset-register', 'source-register', 'telemetry-event', 'manager-action', 'approval-state'],
    modules: ['Factory State', 'Meter Readings', 'CAPA Review', 'Maintenance Risk', 'Manager Action Board'],
    agentCrew: ['Source Cartographer', 'Telemetry Analyst', 'Anomaly Reviewer', 'Approval Guard'],
    approvalGate: 'No hardware, meter, writeback, or customer-facing claim without source evidence and owner approval.',
    proofRoute: '/products/factory-operations',
    appRoute: '/app/factory-operations',
    qaScript: 'npm run audit:operations-twin',
    revenueOffer: 'Factory Operations App',
    promotionState: 'Core platform wedge',
  },
  {
    id: 'workflow-desk',
    name: 'Back Office Workflow Desk',
    status: 'sell-now',
    visibility: 'public-offer',
    buyer: 'Owner-led business with one painful manual workflow',
    firstWorkflow: 'Send one file, sheet, screenshot, email thread, or Drive folder; receive one reviewed queue, source proof, and approval boundary.',
    sourceContracts: ['intake-source', 'workflow-map', 'task-ledger', 'proof-pack', 'approval-policy'],
    modules: ['Workflow Intake', 'Document Ledger', 'Task Queue', 'Proof Pack', 'Owner Brief'],
    agentCrew: ['Intake Analyst', 'Data Cleaner', 'Workflow Mapper', 'Proof Writer'],
    approvalGate: 'No outbound, billing, production deploy, or external writeback without founder approval.',
    proofRoute: '/products/agentops-toolbox',
    appRoute: '/app/cloud-agent-army',
    qaScript: 'npm run audit:ai-workflow-desk',
    revenueOffer: 'Back Office Workflow Desk',
    promotionState: 'Primary commercial offer',
  },
  {
    id: 'source-intake',
    name: 'Document Extraction Ledger',
    status: 'sell-now',
    visibility: 'included-module',
    buyer: 'Finance/admin lead, operator, service owner, distributor, factory back office',
    firstWorkflow: 'Turn scattered records into a reviewable source ledger, clean rows, issues, and next actions.',
    sourceContracts: ['raw-file', 'normalized-record', 'exception', 'review-owner', 'source-freshness'],
    modules: ['Source Register', 'Document Review Queue', 'Record Normalizer', 'Exception Review', 'Export Pack'],
    agentCrew: ['Source Clerk', 'Record Cleaner', 'Exception Analyst', 'Export Reviewer'],
    approvalGate: 'Every record change needs source, reviewer, diff, and rollback note.',
    proofRoute: '/app/documents',
    appRoute: '/app/documents',
    qaScript: 'npm run smoke:app-demo',
    revenueOffer: 'Included source intake module',
    promotionState: 'Shared module primitive',
  },
  {
    id: 'restaurant-pos-inventory',
    name: 'Restaurant POS + Inventory',
    status: 'pilot',
    visibility: 'public-offer',
    buyer: 'Restaurant, cafe, retail food, or service counter owner',
    firstWorkflow: 'Menu/items, orders, payment proof, stock notes, shift handover, and daily close stay on one screen.',
    sourceContracts: ['menu-item', 'order-event', 'payment-proof', 'stock-note', 'daily-close'],
    modules: ['Menu Items', 'Orders and Payments', 'Payment Proof', 'Stock Notes', 'Daily Close'],
    agentCrew: ['Menu Clerk', 'Payment Reviewer', 'Shift Reviewer', 'Owner Brief Writer'],
    approvalGate: 'Payment claims, QR ordering, loyalty, and accounting export wait for review and reconciliation checks.',
    proofRoute: '/products/restaurant-pos-menu-inventory',
    appRoute: '/app/restaurant-pos',
    qaScript: 'npm run smoke:restaurant-pos',
    revenueOffer: 'Restaurant POS + Inventory',
    promotionState: 'Pilot after Back Office Workflow Desk and Factory Operations App proof',
  },
  {
    id: 'easy-erp',
    name: 'SuperMega Operations Ledger',
    status: 'pilot',
    visibility: 'private-pilot',
    buyer: 'Factory, distributor, restaurant group, service business, operator-led SME',
    firstWorkflow: 'Start with inventory, purchase, service, or daily-close control before claiming full ERP replacement.',
    sourceContracts: ['item-master', 'inventory-ledger', 'order-event', 'cash-event', 'role-permission'],
    modules: ['Inventory Ledger', 'Purchase Queue', 'Daily Close', 'Customer Account', 'Role Workspace'],
    agentCrew: ['Operations Clerk', 'Inventory Analyst', 'Finance Reviewer', 'Role Access Builder'],
    approvalGate: 'Transaction-grade modules require reconciliation, role permissions, audit trail, and customer UAT sign-off.',
    proofRoute: '/products',
    appRoute: '/app/erp',
    qaScript: 'npm run audit:ytf-erp-contract',
    revenueOffer: 'Operations Ledger Pilot',
    promotionState: 'Pilot until one transaction-grade module is proven',
  },
  {
    id: 'founder-growth-control-loop',
    name: 'Founder Growth Control Loop',
    status: 'build-next',
    visibility: 'internal-machine',
    buyer: 'SuperMega founder and future customer growth teams',
    firstWorkflow: 'Approve one post, send or log outreach, capture reply, attach lead, request proof, and schedule follow-up.',
    sourceContracts: ['post-draft', 'approval-state', 'published-url', 'reply-event', 'lead-id', 'proof-request'],
    modules: ['Daily Growth Cockpit', 'Approval Queue', 'Published URL Log', 'Reply Ledger', 'Proof Request'],
    agentCrew: ['Growth Operator', 'Offer Writer', 'Reply Classifier', 'Proof Requester'],
    approvalGate: 'No social post, outbound email, DM, ad, or public claim without founder approval.',
    proofRoute: '/proof',
    appRoute: '/app/revenue',
    qaScript: 'npm run audit:commercial',
    revenueOffer: 'Internal growth engine before client growth engine',
    promotionState: 'Build after registry wire-up',
  },
  {
    id: 'supermega-machine',
    name: 'SuperMega Machine',
    status: 'build-next',
    visibility: 'internal-machine',
    buyer: 'SuperMega founder first, later enterprise operators who want their own AI company and workforce control plane',
    firstWorkflow: 'One internal control surface that manages products, workcells, cloud runs, approvals, proof, and growth.',
    sourceContracts: ['agent-company-registry', 'run-ledger', 'product-registry', 'approval-policy', 'proof-evidence'],
    modules: ['Agent Company Registry', 'Cloud Execution Gateway', 'Founder Growth Loop', 'Build Queue', 'Proof Ledger'],
    agentCrew: ['Chief of Staff Agent', 'Product Operator', 'Cloud Run Guard', 'Growth Operator'],
    approvalGate: 'No external actions from the machine without policy, evidence, and human approval.',
    proofRoute: '/app/founder-machine',
    appRoute: '/app/workforce',
    qaScript: 'npm run audit:agentic-ops-registry',
    revenueOffer: 'Internal operating machine first; later AI Company OS',
    promotionState: 'Internal machine, not public offer',
  },
]

export const PRIVATE_CLIENT_PROOFS: PrivateClientProof[] = [
  {
    id: 'ytf-private-proof',
    name: 'Factory Client private proof',
    tenantHost: 'ytf.supermega.dev',
    visibility: 'private-client-proof',
    client: 'Factory Client',
    purpose: 'Private factory operations proof for manager workspaces, KPI cards, action boards, and ERP handoff.',
    sourceBoundary: 'Use the client Drive/source register and tenant-protected routes only.',
    privateRule: 'Do not list YTF as a public product. Reuse anonymized patterns only after approval.',
    proofRoute: '/app/erp',
    appRoute: '/app/erp',
    reusableTemplate: 'Factory Operations App private pilot template',
    blockedPublicClaims: [
      'YTF is a public SuperMega product',
      'Full SAP or Odoo replacement is already live',
      'Client data may be used in public proof routes',
    ],
  },
]

export const AGENT_COMPANY_WORKCELLS: AgentCompanyWorkcell[] = [
  {
    id: 'source-intelligence',
    name: 'Source Intelligence Workcell',
    mission: 'Turn Drive, Sheets, files, screenshots, emails, telemetry, and exports into source contracts.',
    agents: ['Source Cartographer', 'Document Parser', 'Record Cleaner', 'Freshness Watcher'],
    tools: ['Google Drive', 'Gmail', 'Sheets', 'PDF/OCR', 'LlamaIndex', 'n8n read-only workflows'],
    allowedActions: ['read approved sources', 'stage extracted records', 'score quality', 'draft source maps'],
    blockedActions: ['delete source files', 'overwrite production records', 'share client data externally'],
    evidence: ['source id', 'file path', 'extracted row count', 'freshness timestamp', 'review owner'],
    ownerRoute: '/app/data-quality',
  },
  {
    id: 'operations-twin-builders',
    name: 'Factory Operations App Builders',
    mission: 'Convert source contracts into role screens, KPIs, and manager action queues.',
    agents: ['Factory Operations App Architect', 'KPI Analyst', 'Workflow Mapper', 'UX Builder'],
    tools: ['Factory Operations App', 'Portal Factory', 'Vercel preview', 'Codex build lane'],
    allowedActions: ['create module briefs', 'draft routes', 'stage UI patches', 'run audits'],
    blockedActions: ['deploy production', 'claim live customer result without proof', 'skip QA'],
    evidence: ['changed files', 'route link', 'audit output', 'before/after screenshot', 'rollback note'],
    ownerRoute: '/app/founder-machine',
  },
  {
    id: 'erp-clerks',
    name: 'Operations Ledger Clerks',
    mission: 'Build lightweight ERP/POS/CRM modules from proven workflows instead of cloning giant suites.',
    agents: ['Inventory Clerk', 'Daily Close Clerk', 'Purchase Reviewer', 'CRM Follow-up Agent'],
    tools: ['ERP contract', 'POS module', 'CRM queue', 'Neon/Supabase', 'CSV import'],
    allowedActions: ['stage transactions', 'reconcile records', 'draft exceptions', 'prepare exports'],
    blockedActions: ['post financial transaction', 'change inventory balance', 'send invoice', 'modify customer system'],
    evidence: ['source row', 'diff', 'approval state', 'reconciliation check', 'rollback path'],
    ownerRoute: '/app/erp',
  },
  {
    id: 'cloud-execution-guard',
    name: 'Cloud Execution Guard',
    mission: 'Run cloud agent work through policy, approvals, evidence, and blocked action handling.',
    agents: ['Policy Gate', 'Run Ledger Clerk', 'Queue Processor', 'Security Reviewer'],
    tools: ['Vercel Workflow', 'Cloud Tasks', 'EnterpriseAgentRun', 'OpenAI Agents SDK', 'Cloudflare Agents'],
    allowedActions: ['claim queued run', 'dry-run policy', 'execute internal-ledger work', 'record blocked action'],
    blockedActions: ['external writeback', 'credentialed browser action', 'billing activation', 'production deploy'],
    evidence: ['run id', 'policy decision', 'tool scope', 'risk class', 'approval record'],
    ownerRoute: '/app/cloud-agent-army',
  },
  {
    id: 'growth-proof',
    name: 'Growth and Proof Workcell',
    mission: 'Convert platform work into approved offers, proof packs, outreach drafts, replies, and expansion proposals.',
    agents: ['Growth Operator', 'Proof Writer', 'ICP Analyst', 'Customer Success Analyst'],
    tools: ['Sales Desk', 'Lead Pipeline', 'Marketing queue', 'Proof packs', 'LinkedIn/Facebook drafts'],
    allowedActions: ['draft content', 'score leads', 'prepare proof packs', 'log replies'],
    blockedActions: ['publish post', 'send outreach', 'make client-facing claim', 'activate payment link'],
    evidence: ['approved text', 'published URL', 'reply count', 'lead id', 'proof request'],
    ownerRoute: '/app/revenue',
  },
]

export const AGENT_FRAMEWORK_STACK: AgentFrameworkLane[] = [
  {
    id: 'openai-agents-sdk',
    name: 'OpenAI Agents SDK',
    status: 'adopt-now',
    role: 'Primary coded agent runtime',
    useFor: 'Tool use, handoffs, guardrails, traces, skills, computer/file workflows, and production agent loops.',
    packageOrRepo: '@openai/agents / openai-agents-python',
    sourceUrl: 'https://developers.openai.com/api/docs/guides/agents',
    guardrail: 'Use for orchestrated agents only when tool scope, state, evidence, and human review are explicit.',
  },
  {
    id: 'vercel-workflow-ai-sdk',
    name: 'Vercel Workflow + AI SDK',
    status: 'adopt-now',
    role: 'Durable app-agent orchestration',
    useFor: 'Pause/resume workflows, retries, step logs, portal copilots, model calls, and hosted web UX.',
    packageOrRepo: 'workflow / ai',
    sourceUrl: 'https://vercel.com/docs/workflow',
    guardrail: 'Use for long-running jobs and approvals; every external action must pause before execution.',
  },
  {
    id: 'cloudflare-agents',
    name: 'Cloudflare Agents',
    status: 'prototype',
    role: 'Stateful edge agent rooms',
    useFor: 'Always-on watches, tenant state, WebSockets, Durable Object-backed agent state, and edge monitors.',
    packageOrRepo: 'agents',
    sourceUrl: 'https://developers.cloudflare.com/agents/api-reference/agents-api/',
    guardrail: 'Prototype for bounded monitors first; do not grant uncontrolled external write access.',
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    status: 'adopt-now',
    role: 'Deterministic business workflow graphs',
    useFor: 'Human-in-the-loop workflows, checkpointed state, retries, source review, CAPA, KPI story, and approval graphs.',
    packageOrRepo: 'langgraph',
    sourceUrl: 'https://www.langchain.com/agents',
    guardrail: 'Use graph state for repeatable operations; avoid hiding decisions inside chat transcripts.',
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex',
    status: 'adopt-now',
    role: 'Knowledge and retrieval layer',
    useFor: 'Source-grounded answers, document parsing, tenant knowledge indexes, retrieval tools, and citations.',
    packageOrRepo: 'llama-index',
    sourceUrl: 'https://docs.llamaindex.ai/',
    guardrail: 'Every generated answer needs source references, freshness, and owner for stale records.',
  },
  {
    id: 'n8n',
    name: 'n8n',
    status: 'prototype',
    role: 'Connector workflow workbench',
    useFor: 'Read-only connector experiments, client-side automation diagrams, internal webhook prototypes, and workflow templates.',
    packageOrRepo: 'n8n-io/n8n',
    sourceUrl: 'https://github.com/n8n-io/n8n',
    guardrail: 'Self-host only behind auth; code nodes and secrets require strict isolation and security review.',
  },
  {
    id: 'openhands',
    name: 'OpenHands',
    status: 'watch',
    role: 'Software-agent benchmark and optional builder lane',
    useFor: 'Compare cloud software-agent patterns, SDK design, sandboxing, and large-scale development agent operations.',
    packageOrRepo: 'OpenHands/OpenHands',
    sourceUrl: 'https://github.com/OpenHands/OpenHands',
    guardrail: 'Use as research or isolated builder lane until secrets, PR, and deploy boundaries are proven.',
  },
  {
    id: 'microsoft-agent-framework',
    name: 'Microsoft Agent Framework / AutoGen lineage',
    status: 'watch',
    role: 'Enterprise multi-agent orchestration comparison',
    useFor: 'Compare multi-provider orchestration, A2A/MCP interoperability, and enterprise agent fleet patterns.',
    packageOrRepo: 'microsoft/autogen',
    sourceUrl: 'https://github.com/microsoft/autogen',
    guardrail: 'Treat AutoGen as legacy/maintenance; evaluate Microsoft Agent Framework for new enterprise experiments.',
  },
  {
    id: 'crewai',
    name: 'CrewAI',
    status: 'prototype',
    role: 'Role-crew experimentation lane',
    useFor: 'Research crews, sales/proof pods, multi-agent critique, and fast Python workflow experiments.',
    packageOrRepo: 'crewAIInc/crewAI',
    sourceUrl: 'https://github.com/crewAIInc/crewAI',
    guardrail: 'Use for R&D and bounded internal work until enterprise policy and evidence logging match SuperMega gates.',
  },
]

export const AGENT_COMPANY_POLICIES: AgentCompanyPolicy[] = [
  {
    id: 'approval-before-side-effect',
    rule: 'Agents can prepare work, but cannot perform external side effects without approval.',
    blocks: ['outbound publishing', 'billing activation', 'production deploy', 'external writeback', 'credentialed browser action'],
    unlocks: 'Approved action packet with exact target, evidence, risk, owner, and rollback path.',
  },
  {
    id: 'source-before-answer',
    rule: 'Every operational answer must point to the source contract it used.',
    blocks: ['unsupported KPI claim', 'stale customer recommendation', 'untraceable ERP row', 'uncited report'],
    unlocks: 'Source id, freshness, extraction method, and human owner are visible.',
  },
  {
    id: 'module-before-clone',
    rule: 'Do not build random SaaS clones; build reusable modules from proven workflows.',
    blocks: ['new disconnected app page', 'generic CRM/ERP promise', 'feature without buyer and proof route'],
    unlocks: 'Buyer, first workflow, source contract, agent crew, QA script, and revenue offer are registered.',
  },
  {
    id: 'cloud-before-autonomy-claim',
    rule: 'Do not claim autonomous cloud workforce until queue, policy, evidence, and approval gates are live.',
    blocks: ['autonomous claim', 'recurring production worker', 'unreviewed connector action'],
    unlocks: 'Cloud Agent Execution Gateway with dry-run policy and blocked_for_approval outcomes.',
  },
]

export function getAgenticOperationsRegistrySummary() {
  const sellNow = AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.status === 'sell-now').length
  const buildNext = AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.status === 'build-next').length
  const publicOfferCount = AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.visibility === 'public-offer').length
  const privatePilotCount = AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.visibility === 'private-pilot').length
  const internalMachineCount = AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.visibility === 'internal-machine').length
  const adoptNowFrameworks = AGENT_FRAMEWORK_STACK.filter((framework) => framework.status === 'adopt-now').length

  return {
    unitCount: AGENTIC_OPERATIONS_REGISTRY.length,
    sellNow,
    buildNext,
    publicOfferCount,
    privatePilotCount,
    internalMachineCount,
    privateProofCount: PRIVATE_CLIENT_PROOFS.length,
    workcellCount: AGENT_COMPANY_WORKCELLS.length,
    frameworkCount: AGENT_FRAMEWORK_STACK.length,
    adoptNowFrameworks,
    policyCount: AGENT_COMPANY_POLICIES.length,
  }
}

export function getAgenticOperationUnit(id: string) {
  return AGENTIC_OPERATIONS_REGISTRY.find((unit) => unit.id === id) ?? null
}

export function getPublicAgenticOffers() {
  return AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.visibility === 'public-offer')
}

export function getPrivateAgenticPilots() {
  return AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.visibility === 'private-pilot')
}

export function getInternalAgenticMachines() {
  return AGENTIC_OPERATIONS_REGISTRY.filter((unit) => unit.visibility === 'internal-machine')
}
