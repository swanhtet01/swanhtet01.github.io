export type StrategicSource = {
  name: string
  category: string
  url: string
  signal: string
  supermegaTake: string
}

export type OpenSourceAccelerator = {
  name: string
  url: string
  license: string
  pattern: string
  useFor: string
  adoptionRule: string
}

export type PrototypeTool = {
  id: string
  name: string
  buyerLabel: string
  route: string
  problem: string
  workflow: string[]
  inputs: string[]
  outputs: string[]
  moat: string
  readiness: 'proof-ready' | 'build-next' | 'research'
}

export type CompetitiveLayer = {
  layer: string
  incumbent: string
  supermegaAdvantage: string
  proof: string
}

export const PROTOTYPE_FORGE_THESIS = {
  title: 'SuperMega is not trying to be another ERP vendor. It is the AI-native system-of-action factory above every ERP, CRM, spreadsheet, inbox, and SaaS tool.',
  s4hanaAnswer:
    'SAP S/4HANA wins as a deep system of record. SuperMega can win around it by shipping the role portal, data layer, approval gates, evidence ledger, and agent workforce that make business teams move faster before and after ERP modernization.',
  saasKillerDefinition:
    'SaaS killer means replacing the repetitive knowledge-work layer, not recklessly rewriting regulated ledgers. Start with read-only copilots, workflow audits, dashboards that assign actions, browser workers, and custom portals; expand into writeback only after evidence, approval, and rollback gates are green.',
  codexAdvantage:
    'Codex gives SuperMega a compounding build loop: research a market, generate working code in the existing app shell, run audits/builds, record blockers, and repeat. Legacy integrators sell implementation capacity; SuperMega should sell an implementation machine.',
}

export const STRATEGIC_SOURCES: StrategicSource[] = [
  {
    name: 'SAP S/4HANA Cloud Public Edition',
    category: 'ERP benchmark',
    url: 'https://www.sap.com/products/erp/s4hana.html',
    signal:
      'SAP positions S/4HANA Cloud Public Edition as modular ERP with built-in AI across finance, supply chain, HR, and sales processes.',
    supermegaTake:
      'Do not fight SAP on ledger depth. Build the faster intelligence/action layer that connects SAP exports, approvals, role portals, and natural-language work queues.',
  },
  {
    name: 'MIT products and services',
    category: 'Myanmar enterprise integrator',
    url: 'https://www.mit.com.mm/products-and-services',
    signal:
      'MIT publicly lists ERP, POS, distribution, loyalty, HCM, hotel, education, hospital, banking, cloud, security, DevOps, and database services.',
    supermegaTake:
      'MIT owns trust and breadth. SuperMega should own speed, AI-native setup, lightweight prototypes, and cross-system agent operations.',
  },
  {
    name: 'Kaizentic AI',
    category: 'Enterprise AI competitor',
    url: 'https://www.kaizentic.ai/',
    signal:
      'Kaizentic markets secure, scalable enterprise intelligence powered by business data, real-time analytics, governance, automation, and agentic behavior.',
    supermegaTake:
      'Kaizentic validates the market. SuperMega differentiates by being vendor-agnostic, prototype-first, and able to build custom portals plus agent workflows around any data source.',
  },
  {
    name: 'Nirvasoft products',
    category: 'Myanmar SAP/system integrator',
    url: 'https://www.nirvasoft.com/products',
    signal:
      'Nirvasoft positions SAP growth offerings, system integration, and products such as mobile distribution that extend ERP workflows.',
    supermegaTake:
      'Nirvasoft is another proof that Myanmar companies buy integration. SuperMega should make integration visible as a client portal, daily action board, and AI assistant from week one.',
  },
]

export const OPEN_SOURCE_ACCELERATORS: OpenSourceAccelerator[] = [
  {
    name: 'TradingAgents',
    url: 'https://github.com/TauricResearch/TradingAgents',
    license: 'Apache-2.0',
    pattern: 'Multi-agent research, analyst, trader, risk, and portfolio manager roles with decision logs and graph checkpoints.',
    useFor: 'Prototype a Finance Research Room for market briefs, supplier risk, treasury analysis, and investment memos. Do not ship autonomous trading.',
    adoptionRule:
      'Use as an architecture reference and sandbox only until risk disclaimers, source attribution, evaluation, and human approval are implemented.',
  },
  {
    name: 'browser-use',
    url: 'https://github.com/browser-use/browser-use',
    license: 'MIT',
    pattern: 'Browser task automation, custom tools, persistent browser sessions, and examples for form-filling and online task execution.',
    useFor: 'Prototype a Browser Worker that can complete approved web tasks for owners: forms, research capture, vendor portals, and QA checks.',
    adoptionRule:
      'Use only with scoped credentials, no stealth abuse, no CAPTCHA evasion for prohibited access, and full evidence logging before any external action.',
  },
  {
    name: 'LangGraph.js',
    url: 'https://github.com/langchain-ai/langgraphjs',
    license: 'MIT',
    pattern: 'Graph-based controllable agents with memory, human-in-the-loop, and durable task orchestration.',
    useFor: 'Prototype long-running workflow agents: onboarding, monthly close, supplier reviews, and data-quality exception loops.',
    adoptionRule:
      'Use where workflow state and explicit human checkpoints matter more than a simple chat response.',
  },
  {
    name: 'CrewAI',
    url: 'https://github.com/crewAIInc/crewAI',
    license: 'MIT',
    pattern: 'Role-based crews, flows, control-plane concepts, tracing, observability, and enterprise automation positioning.',
    useFor: 'Prototype internal agent teams for sales, research, delivery, support, data cleanup, and implementation QA.',
    adoptionRule:
      'Use the concepts, but keep SuperMega ownership of permissioning, evidence, customer data boundaries, and product UX.',
  },
  {
    name: 'Microsoft AutoGen',
    url: 'https://github.com/microsoft/autogen',
    license: 'MIT plus CC-BY-4.0 docs',
    pattern: 'Multi-agent framework lineage with MCP/browser examples; repository now points new users toward Microsoft Agent Framework.',
    useFor: 'Harvest mature multi-agent design lessons, MCP workbench patterns, and migration warnings.',
    adoptionRule:
      'Do not build new core runtime on a maintenance-mode stack; use it for reference and compatibility thinking.',
  },
]

export const COMPETITIVE_LAYERS: CompetitiveLayer[] = [
  {
    layer: 'System of record',
    incumbent: 'SAP S/4HANA, Oracle, core banking, Odoo, local ERP suites',
    supermegaAdvantage:
      'Read-only first, then governed writeback. SuperMega can sit above the record system and make the first useful workflow faster without ripping out the core.',
    proof: '/app/data-fabric',
  },
  {
    layer: 'System of work',
    incumbent: 'Microsoft 365, Google Workspace, email, spreadsheets, WhatsApp, forms',
    supermegaAdvantage:
      'Turn scattered work into role portals, daily briefs, action boards, approvals, and browser workers with evidence trails.',
    proof: '/app/manager-system',
  },
  {
    layer: 'System of intelligence',
    incumbent: 'BI dashboards, Kaizentic-style enterprise AI, custom reports',
    supermegaAdvantage:
      'Move from passive charts to source-grounded agent recommendations with owners, deadlines, and follow-up loops.',
    proof: '/app/market-intel',
  },
  {
    layer: 'System of creation',
    incumbent: 'Traditional consulting teams, slow implementation cycles, one-off software projects',
    supermegaAdvantage:
      'Codex plus release audits plus portal factory becomes an implementation machine that keeps producing prototypes and modules.',
    proof: '/app/founder-machine',
  },
]

export const GENERAL_USE_PROTOTYPES: PrototypeTool[] = [
  {
    id: 'company-data-room',
    name: 'Company Data Room Analyst',
    buyerLabel: 'For owners and managers',
    route: '/app/data-fabric',
    problem: 'Documents, spreadsheets, policies, and exports exist, but nobody can safely ask operational questions across them.',
    workflow: ['Upload or connect source folder', 'Generate source map', 'Ask questions with citations', 'Create action queue', 'Review evidence before sharing'],
    inputs: ['Drive folder', 'Excel/CSV export', 'PDF policies', 'role permissions'],
    outputs: ['source-grounded brief', 'data quality list', 'owner actions', 'approval-ready memo'],
    moat: 'Fast setup plus evidence-first answers. This is the entry point for every client portal.',
    readiness: 'proof-ready',
  },
  {
    id: 'browser-worker',
    name: 'Approved Browser Worker',
    buyerLabel: 'For repetitive web tasks',
    route: '/app/workforce',
    problem: 'Staff waste time filling forms, checking portals, downloading reports, and copying data between browser systems.',
    workflow: ['Define task', 'Load approved browser profile', 'Run browser agent', 'Capture screenshots/logs', 'Require approval for submit/write actions'],
    inputs: ['task instruction', 'target website', 'credential scope', 'approval policy'],
    outputs: ['task transcript', 'screenshots', 'downloaded files', 'approval request'],
    moat: 'SuperMega can sell labor replacement safely because browser actions are bounded, logged, and reviewed.',
    readiness: 'build-next',
  },
  {
    id: 'market-research-room',
    name: 'Market Research Room',
    buyerLabel: 'For finance, sales, and strategy',
    route: '/app/insights',
    problem: 'Teams need research synthesis, competitor monitoring, market briefs, and decision memos without hiring a full analyst bench.',
    workflow: ['Choose research question', 'Assign analyst agents', 'Collect sources', 'Debate risks', 'Publish decision memo'],
    inputs: ['web sources', 'company files', 'market data exports', 'decision criteria'],
    outputs: ['research memo', 'risk view', 'opportunity list', 'follow-up tasks'],
    moat: 'TradingAgents-style debate becomes a general business research pattern, not only a trading bot.',
    readiness: 'build-next',
  },
  {
    id: 'erp-action-layer',
    name: 'ERP Action Layer',
    buyerLabel: 'For SAP/Odoo/local ERP users',
    route: '/app/erp',
    problem: 'ERP contains records but managers still chase explanations, exceptions, and next actions manually.',
    workflow: ['Import read-only export', 'Detect exceptions', 'Assign owner', 'Draft follow-up', 'Track closure'],
    inputs: ['ERP export/API', 'role map', 'exception rules', 'approval policy'],
    outputs: ['daily exception board', 'manager brief', 'follow-up messages', 'audit log'],
    moat: 'This is the practical path to be 100x faster than S/4HANA projects at first-value delivery.',
    readiness: 'proof-ready',
  },
  {
    id: 'portal-in-a-week',
    name: 'Portal in a Week',
    buyerLabel: 'For any company',
    route: '/app/portal-factory',
    problem: 'A company wants AI but does not know what to build, what data is safe, or what employees should use first.',
    workflow: ['Pick industry', 'Pick roles', 'Connect first sources', 'Generate module set', 'Publish private portal'],
    inputs: ['industry', 'roles', 'data sources', 'top pain points'],
    outputs: ['custom portal', 'module plan', 'launch checklist', 'pricing path'],
    moat: 'This makes SuperMega sellable before it has SAP-level breadth: every client gets a domain-specific portal quickly.',
    readiness: 'proof-ready',
  },
  {
    id: 'agent-security-drill',
    name: 'Agent Security Drill',
    buyerLabel: 'For IT and leadership',
    route: '/app/security',
    problem: 'Companies want AI agents, but they do not know how to test prompt injection, unsafe tool use, secrets, approvals, or auditability.',
    workflow: ['Select agent/tool', 'Run threat checklist', 'Simulate bad input', 'Check evidence logs', 'Create fix tasks'],
    inputs: ['agent instructions', 'tool list', 'secrets policy', 'approval rules'],
    outputs: ['risk score', 'failed controls', 'fix backlog', 'deployment gate'],
    moat: 'This turns AI safety from abstract fear into a paid readiness service and release gate.',
    readiness: 'build-next',
  },
]

export const SAAS_KILLER_SEQUENCE = [
  'Start with one painful knowledge-work loop, not a full-suite replacement.',
  'Build a private portal that understands the company, role, data sources, industry language, and approval rules.',
  'Use proven open-source patterns only where they accelerate a bounded workflow.',
  'Keep source evidence, human approval, and rollback before any external write action.',
  'Productize the workflow into a repeatable module that can be sold across similar companies.',
]
