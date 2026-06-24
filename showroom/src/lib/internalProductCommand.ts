export type InternalProductCommandStatus = 'done' | 'ready' | 'next' | 'blocked'

export type InternalProductWorkstream = {
  id: string
  name: string
  status: InternalProductCommandStatus
  owner: string
  why: string
  shipNext: string
  command: string
  proofGate: string
  borrowedPatterns: string[]
  routes: string[]
}

export type InternalProductLane = {
  id: string
  name: string
  host: string
  status: InternalProductCommandStatus
  appRoute: string
  clientSetupShortcut: string
  nextBuilds: string[]
  proofGate: string
  blockedUntil: string[]
}

export type InternalProductActivationQueueItem = {
  id: string
  productName: string
  status: InternalProductCommandStatus
  setupRoute: string
  sourceInputs: string[]
  operatorAction: string
  proofRequired: string
  acceptanceGate: string
  goLiveBlockers: string[]
}

export type InternalProductCommand = {
  privacyMode: string
  activationState: string
  mainCompanyGap: string
  synthesis: string
  productionRule: string
  metrics: {
    productLaneCount: number
    workstreamCount: number
    blockedWorkstreamCount: number
    nextWorkstreamCount: number
    proofGateCount: number
    activationQueueCount: number
  }
}

export const internalProductLanes: InternalProductLane[] = [
  {
    id: 'custom-workflow-app',
    name: 'Back Office Workflow Desk',
    host: 'app.supermega.dev',
    status: 'next',
    appRoute: '/app/documents',
    clientSetupShortcut: 'Five source examples, one owner rule, one approval-only action, then a 48-hour app map.',
    nextBuilds: [
      'Reusable source-schema builder with required fields, duplicate checks, stale-source flags, and owner review.',
      'Agent simulation ledger that shows read, draft, blocked, approval-required, and completed actions.',
      'Connector cards for Drive, Sheets, Gmail export, CSV, webhook intake, REST API, and fallback manual upload.',
    ],
    proofGate: 'One real source becomes one queue row with evidence, owner, status, blocked action, and acceptance result.',
    blockedUntil: ['Source examples received', 'Owner acceptance rule recorded', 'Rollback/export destination approved'],
  },
  {
    id: 'factory-operations-app',
    name: 'Factory Operations App',
    host: 'app.supermega.dev',
    status: 'next',
    appRoute: '/app/factory-operations',
    clientSetupShortcut: 'One issue log, one asset list, one maintenance or QC source, then a manager closeout workflow.',
    nextBuilds: [
      'Asset, work-order, inspection, CAPA, downtime, repeat-fault, and closeout data model.',
      'QR asset scan and mobile photo proof for receiving, quality, maintenance, and issue closeout.',
      'Maintenance reliability metrics: planned versus reactive, downtime, repeat fault, MTBF, and closeout aging.',
    ],
    proofGate: 'One issue links source proof, asset, owner, CAPA action, manager closeout, and exportable evidence.',
    blockedUntil: ['Asset owner assigned', 'Closeout rule approved', 'Evidence retention policy recorded'],
  },
  {
    id: 'restaurant-pos-inventory',
    name: 'Restaurant POS + Inventory',
    host: 'pos.supermega.dev for public POS proof, app.supermega.dev for approved workspace',
    status: 'next',
    appRoute: '/app/restaurant-pos',
    clientSetupShortcut: 'One menu photo or item sheet, one daily close habit, one payment proof habit, then a branch-day packet.',
    nextBuilds: [
      'Menu item, modifier, availability, QR publish review, and branch-level price-change approval.',
      'Payment proof reconciliation, cash-up variance, settlement status, receipt/export boundary, and manager signoff.',
      'Low-stock exception, supplier note, waste/prep note, shift handover, offline-safe queue, and owner digest.',
    ],
    proofGate: 'One branch day closes with orders, payment proof, stock exception, cash-up variance, and owner report.',
    blockedUntil: ['Menu source received', 'Price-change approver assigned', 'Closeout owner confirmed'],
  },
]

export const internalProductActivationQueue: InternalProductActivationQueueItem[] = [
  {
    id: 'document-extraction-ledger',
    productName: 'Back Office Workflow Desk',
    status: 'next',
    setupRoute: '/contact/?package=document-extraction-ledger',
    sourceInputs: ['5 source examples', 'owner acceptance rule', 'rollback/export destination'],
    operatorAction: 'Turn the client source into a source map, validation rules, duplicate checks, and one approval-only action.',
    proofRequired: 'One source row becomes one queue item with evidence, owner, blocked action, and acceptance result.',
    acceptanceGate: 'Client signs off source fields, rejected-row behavior, export path, and the first automation boundary.',
    goLiveBlockers: ['No source examples', 'No owner for acceptance', 'No rollback/export destination'],
  },
  {
    id: 'factory-issues-maintenance-quality',
    productName: 'Factory Operations App',
    status: 'next',
    setupRoute: '/contact/?package=factory-issues-maintenance-quality',
    sourceInputs: ['issue log', 'asset list', 'maintenance or QC source'],
    operatorAction: 'Build asset, work-order, issue, CAPA, evidence, closeout, and mobile proof rows before promising production rollout.',
    proofRequired: 'One issue links source proof, asset, owner, CAPA action, manager closeout, and exportable evidence.',
    acceptanceGate: 'Plant owner approves asset owner, closeout rule, evidence retention, and mobile capture path.',
    goLiveBlockers: ['No asset owner', 'No closeout rule', 'No evidence retention policy'],
  },
  {
    id: 'restaurant-pos-menu-inventory',
    productName: 'Restaurant POS + Inventory',
    status: 'next',
    setupRoute: '/contact/?package=restaurant-pos-menu-inventory',
    sourceInputs: ['menu photo or item sheet', 'daily close habit', 'payment proof habit'],
    operatorAction: 'Set menu/modifier import, QR publish review, payment proof reconciliation, low-stock exception, and owner digest.',
    proofRequired: 'One branch day closes with orders, payment proof, stock exception, cash-up variance, and owner report.',
    acceptanceGate: 'Owner approves price-change role, closeout owner, payment proof boundary, and receipt/export requirement.',
    goLiveBlockers: ['No menu source', 'No price-change approver', 'No closeout owner'],
  },
]

export const internalProductWorkstreams: InternalProductWorkstream[] = [
  {
    id: 'activation-ledger',
    name: 'Activation ledger and proof queue',
    status: 'blocked',
    owner: 'Platform Ops',
    why: 'The public offer is ready enough; the main company gap is the internal system of record for leads, approvals, value proof, and activation history.',
    shipNext: 'Make the lead ledger and product activation queue the shared source for setup state, product blockers, approval decisions, and proof packet links.',
    command: 'npm run db:lead-ledger:schema',
    proofGate: 'A new request creates a ledger row with product, source map, owner, setup state, proof state, and next operator action.',
    borrowedPatterns: ['Airtable: scalable system of record and business-grade app components', 'Retool: one-click deployed workflow APIs'],
    routes: ['/app/product-ops', '/app/workbench', '/api/product-activation/status'],
  },
  {
    id: 'durable-approval-runtime',
    name: 'Durable approval runtime',
    status: 'next',
    owner: 'Runtime Ops',
    why: 'Client workflows must pause, retry, resume, and show event history when an agent needs approval or a connector fails.',
    shipNext: 'Prototype a durable setup workflow with explicit human approval before send, writeback, payment activation, connector activation, or deploy.',
    command: 'npm run ops:autonomous && npm run audit:autonomous-ops',
    proofGate: 'One workflow pauses at approval, resumes after a decision, and leaves an event log tied to the proof packet.',
    borrowedPatterns: ['Vercel Workflow: durable steps, event logs, and human approval', 'OpenTelemetry: traces, metrics, and logs'],
    routes: ['/app/cloud-agent-army', '/app/meta', '/app/platform-admin'],
  },
  {
    id: 'agent-security-drills',
    name: 'Agent security drill harness',
    status: 'next',
    owner: 'Agent Safety',
    why: 'Autonomous browser, file, API, and multi-agent work is not sellable until malicious inputs, tool misuse, memory poisoning, and overbroad privileges are tested.',
    shipNext: 'Add prompt-injection, tool-poisoning, credential-scope, and approval-bypass fixtures to the agent release gate.',
    command: 'npm run audit:agentic-ops-registry',
    proofGate: 'Every agent crew has allowlisted tools, scoped credentials, blocked external effects, and a passing security-drill record.',
    borrowedPatterns: ['OWASP Top 10 for Agentic Applications 2026', 'GitHub Secure Code Game for agentic AI'],
    routes: ['/app/agent-workbench', '/app/teams', '/app/platform-admin'],
  },
  {
    id: 'integration-replay-studio',
    name: 'Integration replay studio',
    status: 'next',
    owner: 'Integration Studio',
    why: 'Integrations should be sold as scoped, replayable contracts, not vague connector promises.',
    shipNext: 'Create connector contracts with source, scope, cadence, replay fixture, rate-limit note, rollback rule, and owner consent.',
    command: 'npm run integration:studio && npm run audit:integration-studio',
    proofGate: 'One connector can be replayed against a safe fixture and blocked from writeback until an owner approves.',
    borrowedPatterns: ['Retool: triggers, connectors, branching, and deployed APIs', 'MCP security: scoped consent and exact tool boundaries'],
    routes: ['/app/integration-studio', '/app/control-workbench', '/app/source-change'],
  },
  {
    id: 'factory-mobile-proof',
    name: 'Factory mobile proof layer',
    status: 'next',
    owner: 'Industrial Product',
    why: 'The factory wedge must feel like a real frontline system: operator cards, source proof, device-ready flows, and manager closeout.',
    shipNext: 'Add QR scan, mobile photo proof, asset/work-order/CAPA rows, and ISO export readiness to the factory product path.',
    command: 'npm run smoke:enterprise-readiness',
    proofGate: 'One operator phone path captures issue proof, attaches it to the asset, and produces manager closeout evidence.',
    borrowedPatterns: ['Tulip: PDF/SOP-to-app setup, app suites, devices, connectors, and real-time visibility', 'Odoo/MES incumbents: work orders, quality checks, and traceability'],
    routes: ['/app/factory-operations', '/app/plant-manager', '/app/quality'],
  },
  {
    id: 'restaurant-daily-close',
    name: 'Restaurant daily-close harness',
    status: 'next',
    owner: 'Restaurant Product',
    why: 'POS replacement claims need staff-speed flows, kitchen routing boundaries, payment proof, inventory exceptions, and a reliable owner close.',
    shipNext: 'Build menu/modifier approval, QR publish review, payment proof reconciliation, low-stock exception, and owner digest into the POS path.',
    command: 'npm run smoke:restaurant-pos',
    proofGate: 'One branch day closes with menu state, orders, payment proof, stock exception, cash-up variance, and owner approval.',
    borrowedPatterns: ['Square for Restaurants: KDS routing, offline payments, inventory, close-of-day reporting', 'Toast: online ordering checklist, approval mode, and test order'],
    routes: ['/app/restaurant-pos', '/app/service-desk', '/products/restaurant-pos-menu-inventory'],
  },
  {
    id: 'operator-qa-loop',
    name: 'Internal operator QA loop',
    status: 'ready',
    owner: 'Product QA',
    why: 'Clients buy faster when every product has visible setup state, route health, proof packet, and a known next operator action.',
    shipNext: 'Run internal route checks before any public deployment and keep private client proof out of public output.',
    command: 'npm run audit:internal-product-command && npm run build',
    proofGate: 'Product Ops renders the internal command board and the build passes without exposing an internal command JSON under /site.',
    borrowedPatterns: ['OpenAI Codex production systems: codebase improvement, test coverage, and verification loops', 'Playwright: browser route and console checks'],
    routes: ['/app/product-ops', '/app/start', '/app/actions'],
  },
]

export const internalProductCommand: InternalProductCommand = {
  privacyMode: 'Internal operator surface only: keep strategy, blockers, and private proof inside authenticated app routes.',
  activationState: 'checkout_ready_environment_review_required',
  mainCompanyGap:
    'The main company gap is no longer public product explanation. It is internal activation discipline: one ledger, one setup state, one proof loop, one approval runtime, and one route health habit for every product.',
  synthesis:
    'Keep selling narrow wedges, but build the internal operating system that makes each wedge faster to set up, safer to integrate, easier to prove, and more repeatable for clients.',
  productionRule:
    'No connector, payment action, client workspace, external send, writeback, or production deploy goes live until source, owner, scope, rollback, and acceptance test are approved.',
  metrics: {
    productLaneCount: internalProductLanes.length,
    workstreamCount: internalProductWorkstreams.length,
    blockedWorkstreamCount: internalProductWorkstreams.filter((item) => item.status === 'blocked').length,
    nextWorkstreamCount: internalProductWorkstreams.filter((item) => item.status === 'next').length,
    proofGateCount: internalProductLanes.length + internalProductWorkstreams.length,
    activationQueueCount: internalProductActivationQueue.length,
  },
}
