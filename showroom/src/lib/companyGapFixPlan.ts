export type CompanyGapFixPriority = {
  id: string
  label: string
  gap: string
  fix: string
  ownerProof: string
}

export type CompanyProductUpgradeUpdate = {
  productName: string
  currentGap: string
  updateNeeded: string
  clientSetupShortcut: string
  proofGate: string
}

export type CompanyToolFrameworkUpdate = {
  lane: string
  add: string
  reason: string
  guardrail: string
}

export type CompanyReadinessGate = {
  gate: string
  mustProve: string
  blockerIfMissing: string
}

export type CompanyCompetitiveLesson = {
  source: string
  url: string
  lesson: string
  supermegaMove: string
}

export type CompanyClientSetupContract = {
  productName: string
  publicPackage: string
  firstClientSources: string[]
  setupQuestions: string[]
  integrationOptions: string[]
  acceptanceTests: string[]
  launchBlockers: string[]
  automationBoundary: string
  firstProofTarget: string
}

export const companyGapDiagnosis = {
  mainGap:
    'SuperMega is product-rich but buyer-path thin: the products, agents, and demos exist, but clients still need one obvious first purchase, one setup checklist, one integration contract, one acceptance test, and one proof loop.',
  fixStrategy:
    'Narrow the public story to a source-first setup path, then move approved clients through source map, owner approval, private workspace handoff, QA, and value ledger.',
  companyScore: 72,
  targetScore30Days: 85,
  thesis:
    'SuperMega should become the AI-native company operating system: custom apps, data cleanup, insights, agents, and work execution across client tools.',
  antithesis:
    'Buyers do not buy a broad operating system first. They buy a narrow, priced, low-risk workflow that proves value quickly and does not create integration risk.',
  synthesis:
    'Sell three productized wedges first, each with one source-first setup path, one approved workspace handoff, one integration contract, one proof packet, and one expansion plan.',
} as const

export const companyGapFixPriorities: CompanyGapFixPriority[] = [
  {
    id: 'offer-clarity',
    label: 'Offer clarity',
    gap: 'The company story can feel like many products, agents, portals, and demos instead of one clear first purchase.',
    fix: 'Lead with three wedges: Back Office Workflow Desk, Factory Operations App, and Restaurant POS + Inventory.',
    ownerProof: 'Every product page CTA starts with source-first setup and shows the 48-hour map.',
  },
  {
    id: 'setup-contract',
    label: 'Setup contract',
    gap: 'Clients need to know exactly what to send, what happens next, and when accounts or connectors are created.',
    fix: 'Use one client setup packet: source map, owner map, data boundary, price range, acceptance test, and approval gate.',
    ownerProof: 'No connector, writeback, payment action, or private workspace goes live before approval.',
  },
  {
    id: 'integration-boundary',
    label: 'Integration boundary',
    gap: 'Integrations are a selling point, but they become risk if scope, credentials, writeback, and rollback are vague.',
    fix: 'Create an integration contract for every product: source system, scopes, cadence, writeback, rollback, and owner.',
    ownerProof: 'Each connector has a consent record, test replay, and blocked risky action until owner approval.',
  },
  {
    id: 'proof-ledger',
    label: 'Proof ledger',
    gap: 'Screenshots and demos are not enough to sell larger deployments.',
    fix: 'Attach source, before state, after screen, owner decision, QA result, and value assumption to every shipped workflow.',
    ownerProof: 'Every pilot has a value ledger and proof packet before expansion is proposed.',
  },
  {
    id: 'delivery-os',
    label: 'Delivery operating system',
    gap: 'The build machine needs one repeatable path from intake to scoped app to QA to handoff.',
    fix: 'Use project templates, readiness gates, scripts, audits, and runbooks for every client workspace.',
    ownerProof: 'A delivery board shows source received, scope approved, access approved, build started, QA passed, and workspace live.',
  },
  {
    id: 'agent-safety',
    label: 'Agent safety',
    gap: 'Agent autonomy is powerful, but the company cannot sell broad action-taking agents without security drills and approvals.',
    fix: 'Run agent safety drills for prompt injection, malicious source text, tool misuse, memory poisoning, and overbroad permissions.',
    ownerProof: 'Agents can read, draft, classify, and recommend first; external sends, writes, payments, and ERP updates remain approval-gated.',
  },
]

export const companyProductUpgradeUpdates: CompanyProductUpgradeUpdate[] = [
  {
    productName: 'Back Office Workflow Desk',
    currentGap: 'The wedge is understandable, but source schema, duplicate handling, connector scope, and action simulation need to feel packaged.',
    updateNeeded: 'Ship source-schema builder, duplicate and stale-source flags, connector cards, action simulation ledger, and acceptance packet export.',
    clientSetupShortcut: 'Ask for five real source examples and return the first app map within 48 hours.',
    proofGate: 'One source sample becomes one queue row with owner, evidence, status, and blocked action pending approval.',
  },
  {
    productName: 'Factory Operations App',
    currentGap: 'The factory story is strong, but work orders, assets, QR/mobile proof, CAPA, maintenance metrics, and ISO export need to be first-class.',
    updateNeeded: 'Add asset/work-order/CAPA model, QR asset scan, mobile photo proof, planned-versus-reactive maintenance, repeat-fault metrics, and ISO evidence export.',
    clientSetupShortcut: 'Start from one issue log, QC file, maintenance sheet, receiving note, or meter reading export.',
    proofGate: 'One issue links source proof, asset, owner, CAPA action, manager closeout, and exportable evidence.',
  },
  {
    productName: 'Restaurant POS + Inventory',
    currentGap: 'The proof host exists, but payment, receipt, offline queue, menu modifiers, low-stock, and daily-close contracts need to be explicit.',
    updateNeeded: 'Add menu/modifier builder, QR publish approval, payment proof reconciliation, cash-up variance, stock alerts, receipt/export boundary, and owner digest.',
    clientSetupShortcut: 'Start from one menu PDF/photo, item sheet, payment screenshot habit, or daily close sheet.',
    proofGate: 'One branch day closes with orders, payment proof, stock exception, cash-up variance, and owner report.',
  },
  {
    productName: 'Back Office Workflow Desk',
    currentGap: 'AgentOps is powerful internally, but buyers need one visible job that replaces admin work without feeling like an agent lab.',
    updateNeeded: 'Ship a public AgentOps setup path with job scope, source intake, approval policy, run ledger, weekly value report, and blocked-action rules.',
    clientSetupShortcut: 'Ask for one repeated back-office job, five source examples, and the actions that must never run without approval.',
    proofGate: 'One source packet becomes queued agent work with draft output, review owner, blocked action, and weekly value ledger.',
  },
  {
    productName: 'Document Extraction Ledger',
    currentGap: 'Source intake is the real wedge, but confidence, duplicates, missing fields, export register, and rollback need more visible state.',
    updateNeeded: 'Add quality score, duplicate detection, stale-source state, missing-field queue, review owner, and export register.',
    clientSetupShortcut: 'Use upload or link as the default first integration before OAuth or service accounts.',
    proofGate: 'Every cleaned output includes source, confidence, reviewer, next action, and rollback destination.',
  },
  {
    productName: 'Internal Setup and Portal Factory',
    currentGap: 'Client setup state is not visible enough before workspace access.',
    updateNeeded: 'Add setup status, role preview, connector consent, route list, acceptance checklist, QA state, and rollback owner.',
    clientSetupShortcut: 'Reuse one setup packet across all public products and private workspaces.',
    proofGate: 'Private app access is approved only after scope, owner, data boundary, QA, and acceptance test are recorded.',
  },
  {
    productName: 'Integration Studio',
    currentGap: 'Tool and framework expansion needs a value/risk score before it becomes a client promise.',
    updateNeeded: 'Add integration scorecard, scoped auth registry, rate-limit note, data-retention note, fallback export, and tool-use eval.',
    clientSetupShortcut: 'Pilot one connector only when manual upload is blocking the first proof.',
    proofGate: 'Every connector has consent, replay test, trace log, and rollback rule.',
  },
]

export const companyClientSetupContracts: CompanyClientSetupContract[] = [
  {
    productName: 'Agency Client Operator',
    publicPackage: 'agency-client-operator',
    firstClientSources: ['One client inbox/thread', 'Current project tracker', 'Weekly report or status update example'],
    setupQuestions: ['Which client workflow should run first?', 'Who approves client-facing messages?', 'Which missing assets should the operator chase?'],
    integrationOptions: ['Manual upload first', 'Read-only Gmail/Drive export', 'Slack/Notion/Sheets import after approval'],
    acceptanceTests: [
      'One client request becomes a queued work item with owner, asset gaps, next action, and draft client update.',
      'The weekly report draft cites source status, blockers, decisions needed, and next-week priorities.',
      'No client-facing send, scope change, billing action, or workspace writeback runs without approval.',
    ],
    launchBlockers: ['No client workflow owner', 'No sample request or tracker', 'No approval rule for client-facing updates'],
    automationBoundary: 'Agents can summarize, draft, classify, and prepare updates; client sends, billing, scope changes, and client-impacting decisions require approval.',
    firstProofTarget: 'One agency client queue with a draft update, missing-asset ask, and weekly report proof.',
  },
  {
    productName: 'Document Extraction Ledger',
    publicPackage: 'document-extraction-ledger',
    firstClientSources: ['Five real examples', 'Current spreadsheet or folder', 'Owner decision rules'],
    setupQuestions: ['Who owns the queue?', 'What fields decide priority?', 'Which action must stay approval-only?'],
    integrationOptions: ['Manual upload first', 'Google Drive or Sheets read-only', 'Email intake after approval'],
    acceptanceTests: [
      'One source becomes a normalized work item with owner, status, evidence, and next action.',
      'Duplicate or missing fields are flagged before any external action runs.',
      'Approval gate blocks sends, writes, or connector changes until the owner approves.',
    ],
    launchBlockers: ['No source examples', 'No owner for acceptance', 'No rollback/export destination'],
    automationBoundary: 'Agents can classify, draft, and recommend; writes, sends, and connector actions require approval.',
    firstProofTarget: '48-hour document-ledger map plus one working source-to-queue proof.',
  },
  {
    productName: 'Back Office Workflow Desk',
    publicPackage: 'back-office-workflow-desk',
    firstClientSources: ['Five real source examples', 'One repeated admin job', 'Approval and blocked-action rules'],
    setupQuestions: ['Which job should run weekly?', 'Who reviews output?', 'Which action needs approval?'],
    integrationOptions: ['Manual upload first', 'Read-only mailbox or Drive export', 'Browser task recording after approval'],
    acceptanceTests: [
      'One source packet becomes queued work with drafted output, owner review, blocked action, and source proof.',
      'The weekly value ledger shows work completed, time saved estimate, misses, decisions, and next queue changes.',
      'No send, writeback, payment, credential use, or customer-impacting decision runs without an approval record.',
    ],
    launchBlockers: ['No repeated job owner', 'No source examples', 'No blocked-action policy'],
    automationBoundary: 'Agents can read, clean, research, draft, summarize, and prepare actions; sends, writes, payments, account changes, and customer decisions require approval.',
    firstProofTarget: 'One managed back-office queue running with approval gates and a weekly proof ledger.',
  },
  {
    productName: 'Factory Operations App',
    publicPackage: 'factory-issues-maintenance-quality',
    firstClientSources: ['Issue log', 'Asset list', 'Maintenance/QC sheet or photo proof habit'],
    setupQuestions: ['Which assets matter first?', 'Who closes CAPA?', 'What evidence is required for audit export?'],
    integrationOptions: ['CSV/manual import first', 'QR asset scan', 'Read-only maintenance or QC export'],
    acceptanceTests: [
      'One issue links source proof, asset, owner, CAPA action, and manager closeout.',
      'QR or photo evidence attaches to the right asset without exposing private tenant markers.',
      'ISO/CAPA export includes source, decision, closeout, and timestamp.',
    ],
    launchBlockers: ['No asset owner', 'No closeout rule', 'No evidence retention policy'],
    automationBoundary: 'Agents can summarize anomalies and propose CAPA; asset state changes and closeout require approval.',
    firstProofTarget: 'One issue-to-closeout workflow with exportable evidence.',
  },
  {
    productName: 'Restaurant POS + Inventory',
    publicPackage: 'restaurant-pos-menu-inventory',
    firstClientSources: ['Menu photo/PDF', 'Item sheet', 'Payment screenshot or daily close sheet'],
    setupQuestions: ['Who approves menu changes?', 'How is payment proof reconciled?', 'What stock exception matters first?'],
    integrationOptions: ['Menu import first', 'QR publish approval', 'Payment proof reconciliation after owner approval'],
    acceptanceTests: [
      'One branch day closes with orders, payment proof, stock exception, and owner report.',
      'Menu/modifier update waits for owner approval before public QR publish.',
      'Cash-up variance is visible without connecting payment credentials first.',
    ],
    launchBlockers: ['No menu source', 'No price-change approver', 'No closeout owner'],
    automationBoundary: 'Agents can draft reports and flag variance; payment reconciliation, stock changes, and menu publish require approval.',
    firstProofTarget: 'One daily-close packet for a real branch day.',
  },
]

export const companyToolsFrameworksToAdd: CompanyToolFrameworkUpdate[] = [
  {
    lane: 'Durable workflow runtime',
    add: 'Vercel Workflow or LangGraph durable execution',
    reason: 'Client automations must pause, retry, resume, and show status across approvals and failures.',
    guardrail: 'External sends, writes, payments, and ERP updates require a human approval step.',
  },
  {
    lane: 'Observability',
    add: 'OpenTelemetry traces, metrics, and logs',
    reason: 'Buyers need evidence that source intake, agent action, connector calls, and QA ran correctly.',
    guardrail: 'Store trace IDs in the proof packet and redact client secrets from logs.',
  },
  {
    lane: 'CRM and value ledger',
    add: 'Lead ledger plus pilot value ledger in Postgres',
    reason: 'Sales, setup, proof, and expansion should share one source of truth.',
    guardrail: 'Keep public proof generic unless the client explicitly approves reuse.',
  },
  {
    lane: 'Agent security',
    add: 'OWASP Agentic Top 10 checks and GitHub Secure Code Game style drills',
    reason: 'Agents that browse, call APIs, use files, and coordinate tasks are a new attack surface.',
    guardrail: 'Tool allowlists, scoped credentials, approval gates, prompt-injection fixtures, and audit logs are required before autonomy.',
  },
  {
    lane: 'Browser QA',
    add: 'Playwright route, mobile, screenshot, and console checks',
    reason: 'Product pages and app routes need proof they render, explain the offer, and do not leak private client markers.',
    guardrail: 'Public output verification must pass before deploy.',
  },
  {
    lane: 'Payments and billing',
    add: 'Stripe product, checkout, invoice, and quote handoff readiness',
    reason: 'A sellable offer needs price, acceptance, invoice, and payment status tied to the approved setup scope.',
    guardrail: 'No billing activation before scope and acceptance test are approved.',
  },
]

export const companyOfferReadinessGates: CompanyReadinessGate[] = [
  {
    gate: 'Public clarity gate',
    mustProve: 'A buyer can name the first product, source needed, expected output, price range, and next step.',
    blockerIfMissing: 'The offer is not ready to sell.',
  },
  {
    gate: 'Source intake gate',
    mustProve: 'One real source becomes a field map, missing-field list, owner, first screen, and acceptance test.',
    blockerIfMissing: 'The workflow is not ready to build.',
  },
  {
    gate: 'Setup approval gate',
    mustProve: 'Scope, data boundary, role map, connector boundary, timeline, and price are approved.',
    blockerIfMissing: 'Do not create private access or connect credentials.',
  },
  {
    gate: 'Workspace QA gate',
    mustProve: 'Route renders, source data is visible, actions are gated, proof packet exports, and no private marker leaks.',
    blockerIfMissing: 'Do not hand off the workspace.',
  },
  {
    gate: 'Integration safety gate',
    mustProve: 'Scopes, auth, cadence, writeback, retry, rollback, and owner approval are recorded.',
    blockerIfMissing: 'Keep the integration manual or read-only.',
  },
  {
    gate: 'Proof and ROI gate',
    mustProve: 'Before state, after output, owner decision, QA result, and value assumption are in the value ledger.',
    blockerIfMissing: 'Do not propose expansion yet.',
  },
]

export const companyCompetitiveLessons: CompanyCompetitiveLesson[] = [
  {
    source: 'Retool',
    url: 'https://www.globenewswire.com/news-release/2023/07/13/2704537/0/en/beyond-internal-tools-retool-announces-new-products-for-building-business-apps-and-portals-for-vendors-partners-and-customers.html',
    lesson: 'Fast business-app platforms sell secure portals, authentication, permissions, embedding, and speed.',
    supermegaMove: 'Make approved workspace handoff, role preview, permissions, and client setup state obvious.',
  },
  {
    source: 'Tulip',
    url: 'https://tulip.co/platform/',
    lesson: 'Frontline platforms sell app suites, PDF/SOP-to-app setup, connectors, devices, and real-time visibility.',
    supermegaMove: 'Package factory workflows as asset, work order, CAPA, QR, operator proof, and manager dashboard modules.',
  },
  {
    source: 'Odoo Manufacturing',
    url: 'https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/shop_floor/shop_floor_overview.html',
    lesson: 'Manufacturing buyers expect shop-floor cards, work centers, work orders, quality checks, scrap, operators, and prioritization.',
    supermegaMove: 'Add work-order and quality state before claiming broad factory operating-system replacement.',
  },
  {
    source: 'Square for Restaurants',
    url: 'https://squareup.com/help/us/en/article/5119-create-and-manage-item-modifiers',
    lesson: 'Restaurant POS setup must handle item modifiers, item-level ordering, required selections, receipts, reports, and staff speed.',
    supermegaMove: 'Add modifier builder, QR publish review, stock and daily-close flow, and manager approval before price changes.',
  },
  {
    source: 'Toast Online Ordering',
    url: 'https://support.toasttab.com/en/article/Getting-Started-Online-Ordering',
    lesson: 'Operational setup checklists end with a real test order and clear approval mode.',
    supermegaMove: 'End POS setup with a test day close and blocked payment-provider boundary until approval.',
  },
  {
    source: 'OpenAI Codex production systems',
    url: 'https://openai.com/business/guides-and-resources/how-openai-uses-codex/',
    lesson: 'Production agent work should map code, modernize systems, improve test coverage, and close with verification.',
    supermegaMove: 'Turn every product upgrade into generator, audit, build, static output, and browser QA steps.',
  },
  {
    source: 'GitHub Secure Code Game for agentic AI',
    url: 'https://github.blog/security/hack-the-ai-agent-build-agentic-ai-security-skills-with-the-github-secure-code-game/',
    lesson: 'Autonomous agents create risks around web access, APIs, tools, memory, and multi-agent chains.',
    supermegaMove: 'Require agent safety drills and approval ledgers before selling broad computer-use autonomy.',
  },
]
