export type ProductUpgradeLane = {
  id: string
  label: string
  clientQuestion: string
  proofRequired: string
}

export type ProductUpgradeBacklogItem = {
  productId: string
  publicProductId: string
  productName: string
  maturityScore: number
  currentGrade: string
  synthesis: string
  priorityUpgrades: string[]
  frameworksToAdd: string[]
  integrationContracts: string[]
  securityGates: string[]
  clientAcceptanceTests: string[]
  next30Days: string[]
}

export const productUpgradeResearchSources = [
  {
    name: 'OpenAI Codex production systems',
    url: 'https://developers.openai.com/codex/use-cases/collections/production-systems',
    lesson: 'Use codebase tours, modernization, codified workflows, system-health loops, and focused QA as production operating habits.',
  },
  {
    name: 'GitHub Secure Code Game for agentic AI',
    url: 'https://github.blog/security/hack-the-ai-agent-build-agentic-ai-security-skills-with-the-github-secure-code-game/',
    lesson: 'Treat web access, MCP tools, skills, memory, and multi-agent coordination as expanding attack surfaces that need drills.',
  },
  {
    name: 'Vercel Workflow',
    url: 'https://vercel.com/docs/workflow',
    lesson: 'Use durable, resumable, observable workflow steps for long-running client automations.',
  },
  {
    name: 'LangGraph durable execution',
    url: 'https://docs.langchain.com/oss/python/langgraph/durable-execution',
    lesson: 'Persist workflow progress, use thread identifiers, and isolate side effects so interrupted agent work can resume safely.',
  },
  {
    name: 'LangChain human-in-the-loop middleware',
    url: 'https://docs.langchain.com/oss/python/langchain/human-in-the-loop',
    lesson: 'Pause risky tool calls for approve, edit, reject, or respond decisions before execution.',
  },
  {
    name: 'OpenTelemetry',
    url: 'https://opentelemetry.io/docs/',
    lesson: 'Instrument traces, metrics, and logs so client deployments have an evidence trail beyond screenshots.',
  },
  {
    name: 'MCP security best practices',
    url: 'https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices',
    lesson: 'Use per-client consent, scoped credentials, exact redirect validation, secure sessions, and local-server consent.',
  },
  {
    name: 'OWASP Top 10 for Agentic Applications 2026',
    url: 'https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/',
    lesson: 'Frame agent-governance readiness around risks specific to autonomous systems that plan, act, and use tools.',
  },
] as const

export const productUpgradeLanes: ProductUpgradeLane[] = [
  {
    id: 'sellability',
    label: 'Sellability',
    clientQuestion: 'Can the buyer understand the first workflow, price, proof, and go-live boundary in one call?',
    proofRequired: 'Sample source, before state, first screen, acceptance checklist, and handoff packet.',
  },
  {
    id: 'integration',
    label: 'Integration',
    clientQuestion: 'Can the client approve exact data sources, scopes, sync cadence, and writeback limits?',
    proofRequired: 'Connector scope registry, OAuth or service-account notes, field map, and rollback rule.',
  },
  {
    id: 'agent-safety',
    label: 'Agent Safety',
    clientQuestion: 'Can an agent read, draft, and recommend without silently performing risky actions?',
    proofRequired: 'Tool allowlist, secure-code drill, prompt-injection fixture, and approval ledger.',
  },
  {
    id: 'runtime',
    label: 'Runtime',
    clientQuestion: 'Can long-running work pause, retry, resume, and expose status after deploys or failures?',
    proofRequired: 'Durable workflow plan, retry policy, event log, alert route, and operator recovery note.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    clientQuestion: 'Can the outcome be audited by source, owner decision, screenshot, and ROI assumption?',
    proofRequired: 'Value ledger with source packet, owner approval, before/after output, and test result.',
  },
]

export const publicProductUpgradeBacklog: ProductUpgradeBacklogItem[] = [
  {
    productId: 'custom-workflow-app-starter',
    publicProductId: 'ai-workflow-desk',
    productName: 'Back Office Workflow Desk',
    maturityScore: 78,
    currentGrade: 'Sellable as a scoped pilot; needs stronger connector contracts and durable automation before broad client rollout.',
    synthesis:
      'Keep the wedge narrow, but make each source, approval, and agent action traceable enough for a client to trust expansion.',
    priorityUpgrades: [
      'Add a reusable workflow source-schema builder with required fields, duplicate handling, stale-source flags, and owner review.',
      'Add an agent simulation ledger that shows read, draft, send, update, blocked, and approval-required actions before writeback.',
      'Package connector contracts for Drive, Sheets, Gmail exports, CSV, REST API, and webhook intake with refresh cadence.',
      'Create a client acceptance packet with source sample, first screen, acceptance checks, screenshots, and rollback note.',
    ],
    frameworksToAdd: [
      'OpenAI eval fixtures for extraction and routing quality',
      'LangGraph or Vercel Workflow for resumable approval loops',
      'OpenTelemetry traces for intake-to-approval visibility',
      'MCP-style scoped connector registry with per-client consent',
    ],
    integrationContracts: [
      'Source field map and validation rule per workflow',
      'OAuth or service-account scope list with read/write boundary',
      'Webhook and export cadence with retry and owner alert rules',
    ],
    securityGates: [
      'Agent security drill for prompt injection, malicious source text, and tool misuse',
      'Manual approval before sending email, updating records, or calling external write APIs',
      'Connector token storage, scope review, and per-client consent record',
    ],
    clientAcceptanceTests: [
      'A real source sample becomes one queue row with owner, status, evidence, and due date.',
      'The agent prepares one action and blocks execution until a human decision is recorded.',
      'The proof packet exports source, screenshot, acceptance checks, and owner approval.',
    ],
    next30Days: [
      'Ship source-schema builder and connector scope packet.',
      'Add simulation ledger to the public proof route and app route.',
      'Create five buyer templates: admin queue, sales follow-up, finance exception, document cleanup, and weekly owner report.',
    ],
  },
  {
    productId: 'factory-operations-app',
    publicProductId: 'operations-digital-twin',
    productName: 'Factory Operations App',
    maturityScore: 74,
    currentGrade: 'Strong proof narrative; needs first-class asset/work-order data and mobile proof before production factory claims.',
    synthesis:
      'Do not claim full MES replacement yet; own the plant-manager control surface, then integrate work orders, assets, CAPA, and evidence.',
    priorityUpgrades: [
      'Add asset, work-order, inspection, CAPA, downtime, repeat-fault, and closeout tables with source evidence.',
      'Add QR/barcode asset scan, mobile photo proof, and operator-friendly issue intake for tablet and phone.',
      'Add preventive-maintenance schedule, parts notes, planned-versus-reactive work, MTBF, and repeat-fault metrics.',
      'Create ISO evidence export and manager signoff flow for issue-to-CAPA-to-closeout review.',
    ],
    frameworksToAdd: [
      'Postgres audit tables for asset and work-order history',
      'QR/barcode capture lane for receiving, QC, maintenance, and asset checks',
      'OpenTelemetry traces for issue intake, assignment, and closeout',
      'Durable workflow runtime for preventive-maintenance reminders and escalations',
    ],
    integrationContracts: [
      'Asset and machine register import contract',
      'Work-order and maintenance action schema',
      'Quality evidence export and ISO audit packet format',
    ],
    securityGates: [
      'Role gate for operator, supervisor, plant manager, and admin actions',
      'Human approval before closing CAPA, changing asset state, or escalating external notifications',
      'Agent security drill for malicious operator notes, forged evidence, and overbroad maintenance writeback',
    ],
    clientAcceptanceTests: [
      'One issue intake links source proof, asset, owner, risk, CAPA action, and manager closeout.',
      'One QR scan opens the correct asset/work-order context on mobile.',
      'One ISO evidence export includes source, timeline, decisions, and closeout proof.',
    ],
    next30Days: [
      'Ship asset/work-order/CAPA data model and proof seed.',
      'Add QR asset scan and mobile photo proof path.',
      'Add maintenance reliability metrics and ISO evidence export.',
    ],
  },
  {
    productId: 'restaurant-pos-menu-inventory',
    publicProductId: 'restaurant-group-os',
    productName: 'Restaurant POS + Inventory',
    maturityScore: 72,
    currentGrade: 'Useful for menu, proof, and owner reporting; needs payment, receipt, offline, and stock contracts before POS replacement.',
    synthesis:
      'Position as an owner-control and daily-close layer first, then integrate payments, inventory, kitchen, and receipt workflows carefully.',
    priorityUpgrades: [
      'Add menu item, modifier, availability, QR menu publish review, and branch-level price change approval.',
      'Add payment proof reconciliation, cash-up variance, settlement status, receipt/export adapter, and manager signoff.',
      'Add stock decrement, low-stock alert, supplier note, waste/prep note, and daily close summary.',
      'Add kitchen station, table/order state, shift handover, offline-safe local queue, and owner daily digest.',
    ],
    frameworksToAdd: [
      'Payment proof parser and reconciliation fixtures',
      'Offline-safe local queue for counter workflows',
      'Receipt/export adapter boundary before payment-provider integration',
      'Playwright mobile cashier QA for under-one-minute actions',
    ],
    integrationContracts: [
      'Menu, modifier, item availability, and QR publish contract',
      'Payment provider and receipt hardware boundary',
      'Inventory decrement, supplier note, and daily close export contract',
    ],
    securityGates: [
      'Manager approval before settlement changes, refunds, cash variance closeout, or price changes',
      'No unattended payment action without provider contract and reconciliation proof',
      'Agent security drill for forged payment screenshots, malicious menu notes, and inventory writeback misuse',
    ],
    clientAcceptanceTests: [
      'One branch day closes with orders, payment proof, stock exceptions, cash-up variance, and owner digest.',
      'One QR menu change routes through manager approval before publish.',
      'One low-stock item creates an exception with supplier note and shift handover.',
    ],
    next30Days: [
      'Ship menu/modifier/QR publish review and daily close seed data.',
      'Add payment proof reconciliation and receipt/export boundaries.',
      'Add offline queue, stock exception, and owner digest acceptance checks.',
    ],
  },
]
