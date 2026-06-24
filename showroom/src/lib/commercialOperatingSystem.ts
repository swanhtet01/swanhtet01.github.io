export type CommercialOffer = {
  id: string
  name: string
  category: string
  targetBuyer: string
  promise: string
  qualifyingPain: string
  starterPrice: string
  pilotPrice: string
  retainerPrice: string
  firstWorkflow: string
  proofRoute: string
  sourceInputs: string[]
  implementationChecklist: string[]
  deliverables: string[]
  expansionPath: string[]
  agentJobs: string[]
  objectionResponse: string
}

export type CommercialPersona = {
  id: string
  name: string
  buyerTitle: string
  urgentMoment: string
  buyingTrigger: string
  emotionalFrame: string
  firstOffer: string
  proofNeeded: string
}

export type CommercialChecklist = {
  id: string
  name: string
  owner: string
  items: string[]
}

export type CommercialTemplate = {
  id: string
  name: string
  channel: string
  subject?: string
  body: string
}

export type CommercialAgentSeat = {
  id: string
  name: string
  mission: string
  tools: string[]
  output: string
  reviewGate: string
}

export type CommercialPricingTier = {
  id: string
  name: string
  price: string
  buyerFit: string
  includes: string[]
  upgradeWhen: string
}

export type CommercialSolutionBlueprint = {
  id: string
  name: string
  buyerSituation: string
  whatTheyThinkTheyWant: string
  whatTheyActuallyNeed: string
  primaryOfferId: string
  priceTierId: string
  firstScreen: string
  discoveryQuestions: string[]
  sourceChecklist: string[]
  setupSteps: string[]
  proposalOpening: string
  proofRoute: string
  upsellPath: string[]
  decisionRisk: string
}

export type CommercialIntegrationStep = {
  id: string
  name: string
  clientAction: string
  supermegaAction: string
  proof: string
  approvalGate: string
}

export type CommercialProductUpgrade = {
  id: string
  name: string
  buyerValue: string
  tools: string[]
  proof: string
  gate: string
}

export type CommercialSocialApprovalPolicy = {
  status: string
  canDraft: string[]
  cannotDoYet: string[]
  publishChecklist: string[]
  connectorNotes: string[]
}

export const COMMERCIAL_POSITIONING = {
  thesis: 'Clients think they want a website, dashboard, CRM, ERP, chatbot, or automation.',
  antithesis: 'Buying another generic tool creates more login sprawl, more unmanaged data, and more work for managers.',
  synthesis:
    'SuperMega sells one role-based operating workflow first, then expands it into a client workspace, data fabric, and reviewed automation lanes.',
  salesRule: 'Never sell vague automation. Sell one painful workflow, one buyer, one source map, one review loop, and one visible first screen.',
} as const

export const COMMERCIAL_CLIENT_INTEGRATION_STEPS: CommercialIntegrationStep[] = [
  {
    id: 'source-packet',
    name: 'Source packet',
    clientAction: 'Send one folder, sheet, export, screenshot set, menu, issue log, or current workflow recording.',
    supermegaAction: 'Create the source register, field map, first-screen scope, and missing-data questions.',
    proof: 'Buyer can see which source produced each row, task, or recommendation.',
    approvalGate: 'Client confirms source permission before ingestion or connector work.',
  },
  {
    id: 'role-map',
    name: 'Role map',
    clientAction: 'Name the owner, reviewer, daily users, and decisions that require approval.',
    supermegaAction: 'Configure the role-safe workspace, queue states, review steps, and handoff route.',
    proof: 'Each user can find their next action without seeing private or unrelated work.',
    approvalGate: 'Founder or client owner approves users, roles, and private data boundary.',
  },
  {
    id: 'module-launch',
    name: 'First module launch',
    clientAction: 'Approve the first module goal, acceptance checks, and rollout date.',
    supermegaAction: 'Ship the working screen, proof pack, mobile/desktop check, and change log.',
    proof: 'One real workflow runs from source to screen to owner decision.',
    approvalGate: 'No production deploy, billing activation, or external claim before acceptance checks pass.',
  },
  {
    id: 'connector-upgrade',
    name: 'Connector upgrade',
    clientAction: 'Approve OAuth, service account, API token, device lane, or scheduled source refresh.',
    supermegaAction: 'Add the smallest connector with audit logs, retry behavior, rollback, and human review.',
    proof: 'The module refreshes from an approved source while blocking risky side effects.',
    approvalGate: 'External writeback, sending, payment, accounting, and device actions remain approval-gated.',
  },
]

export const COMMERCIAL_BUYER_HANDOFF_FIELDS = [
  'buyer and workflow owner',
  'source examples and excluded data',
  'first screen outcome',
  'approval owner',
  'price band',
  'go-live acceptance checks',
] as const

export const COMMERCIAL_PRODUCT_UPGRADE_ROADMAP: CommercialProductUpgrade[] = [
  {
    id: 'agent-security-drill',
    name: 'Agent Security Drill',
    buyerValue: 'Proves the product can use agents without giving them unsafe tool, memory, browser, or file permissions.',
    tools: ['sandboxed run log', 'tool allowlist', 'prompt-injection drill', 'memory review'],
    proof: 'One adversarial test note with blocked actions and approved permissions.',
    gate: 'Autonomous browsing, file access, external sending, and writeback remain blocked until owner-approved.',
  },
  {
    id: 'eval-release-harness',
    name: 'Eval and Release Harness',
    buyerValue: 'Makes each product easier to sell because acceptance checks, smoke tests, and browser proof are repeatable.',
    tools: ['acceptance fixtures', 'Playwright checks', 'public-output smoke', 'console/error audit'],
    proof: 'Build plus desktop/mobile route proof for the first workflow.',
    gate: 'No handoff until source-to-screen, source-to-proof, routing, and first viewport checks pass.',
  },
  {
    id: 'connector-pack',
    name: 'Connector Pack',
    buyerValue: 'Turns upload-first proof into approved live sources without exposing broad account access too early.',
    tools: ['Drive', 'Sheets/CSV', 'Gmail exports', 'POS/ERP exports', 'service accounts'],
    proof: 'A source register row showing refresh time, owner, excluded data, retry result, and rollback path.',
    gate: 'Connector activation waits for source ownership, excluded-data rules, and refresh cadence approval.',
  },
  {
    id: 'mobile-capture-pack',
    name: 'Mobile Capture Pack',
    buyerValue: 'Lets operators capture photo proof, quick status, closeout, issues, menu edits, or stock notes from the floor.',
    tools: ['responsive QA', 'file/photo upload', 'quick status forms', 'manager review queue'],
    proof: 'Mobile screenshot and one reviewed field submission visible to the manager.',
    gate: 'Mobile release requires readable first viewport, no overlap, and review trail visibility.',
  },
  {
    id: 'managed-ops-loop',
    name: 'Managed Operations Loop',
    buyerValue: 'Turns the first product into a retainer: weekly review, source-change watch, exception queue, and owner brief.',
    tools: ['weekly owner brief', 'source-change monitor', 'exception queue', 'proof ledger'],
    proof: 'One weekly operating packet with decisions, blockers, source deltas, and next actions.',
    gate: 'Recurring output remains draft/review/approve until client approves external actions and billing.',
  },
]

export const COMMERCIAL_PRICING_TIERS: CommercialPricingTier[] = [
  {
    id: 'diagnostic',
    name: 'Workflow Diagnostic',
    price: 'Free to USD 250',
    buyerFit: 'Warm leads, referrals, event contacts, or owners who need help defining the first workflow.',
    includes: ['30 to 60 minute discovery', 'workflow pain map', 'first offer recommendation', 'data/source access list'],
    upgradeWhen: 'The buyer has a real workflow, owner, files, and urgency.',
  },
  {
    id: 'starter-sprint',
    name: 'Starter Sprint',
    price: 'USD 1,500 to USD 3,500',
    buyerFit: 'Owner-led teams that need one working desk quickly before a bigger portal scope.',
    includes: ['one Back Office Workflow Desk', 'starter roles', 'source intake checklist', 'review queue', 'proof handoff'],
    upgradeWhen: 'The team uses the first desk and wants more sources, roles, or prepared tasks.',
  },
  {
    id: 'business-os-pilot',
    name: 'Business OS Pilot',
    price: 'USD 5,000 to USD 15,000',
    buyerFit: 'Factories, distributors, service groups, restaurants, and client-service teams with multiple roles.',
    includes: ['tenant workspace', '2 to 4 modules', 'document intake', 'prepared drafts', 'manager review cadence'],
    upgradeWhen: 'The portal becomes a weekly operating surface for managers.',
  },
  {
    id: 'enterprise-portal',
    name: 'Enterprise Operating Workspace',
    price: 'USD 18,000 to USD 60,000 plus',
    buyerFit: 'Companies replacing spreadsheet/ERP/CRM workarounds with role-based operating software.',
    includes: ['custom workspace architecture', 'role policy', 'data fabric', 'automation controls', 'audit and deployment gates'],
    upgradeWhen: 'The client needs production integrations, security review, and multi-department rollout.',
  },
  {
    id: 'managed-ai-ops',
    name: 'Managed Operations Retainer',
    price: 'USD 1,500 to USD 8,000 per month',
    buyerFit: 'Clients that need ongoing monitoring, workflow improvements, reporting, and prepared output review.',
    includes: ['weekly operating review', 'source-change monitoring', 'content/report drafts', 'model and workflow tuning'],
    upgradeWhen: 'A workflow becomes business-critical and needs dedicated operating support.',
  },
]

export const COMMERCIAL_OFFERS: CommercialOffer[] = [
  {
    id: 'workflow-desk',
    name: 'Back Office Workflow Desk',
    category: 'Core wedge',
    targetBuyer: 'Founder, operations manager, sales lead, or department head',
    promise: 'Turn one messy workflow into a working queue with owners, files, status, approvals, and next actions.',
    qualifyingPain: 'The team is chasing work across WhatsApp, email, spreadsheets, Drive folders, and verbal reminders.',
    starterPrice: 'USD 1,500 to USD 3,500',
    pilotPrice: 'USD 5,000 to USD 10,000',
    retainerPrice: 'USD 1,500 per month plus',
    firstWorkflow: 'One daily queue for the highest-friction process.',
    proofRoute: '/app/documents',
    sourceInputs: ['workflow screenshots', 'sample spreadsheet', 'email/Drive examples', 'current owner list'],
    implementationChecklist: [
      'Name the buyer and workflow owner.',
      'List current files, messages, and status fields.',
      'Choose the first queue columns and next-action states.',
      'Add human review before any outbound action.',
      'Ship a proof desk and run one live operating review.',
    ],
    deliverables: ['workflow map', 'role-based desk', 'task queue', 'review template', 'proof script'],
    expansionPath: ['client workspace', 'follow-up drafts', 'dashboard/reporting', 'managed operations'],
    agentJobs: ['summarize open work', 'draft follow-up', 'flag missing source evidence', 'prepare manager brief'],
    objectionResponse:
      'We are not asking you to replace your whole system. We start with one workflow your team already understands and prove value in that lane.',
  },
  {
    id: 'client-portal',
    name: 'Client and Department Portal',
    category: 'Portal product',
    targetBuyer: 'Agency owner, B2B service firm, distributor, internal department, or client success lead',
    promise: 'Give each client, branch, or department a branded room for requests, files, approvals, and delivery status.',
    qualifyingPain: 'Customers and managers keep asking for status because work lives in inboxes and shared folders.',
    starterPrice: 'USD 2,500 to USD 5,000',
    pilotPrice: 'USD 8,000 to USD 18,000',
    retainerPrice: 'USD 2,000 per month plus',
    firstWorkflow: 'Request intake, file upload, status sharing, and approval handoff.',
    proofRoute: '/products/client-portal',
    sourceInputs: ['client list', 'request forms', 'Drive folder structure', 'status reporting format'],
    implementationChecklist: [
      'Define tenant or client boundaries.',
      'Create role-safe access groups.',
      'Map request types and required evidence.',
      'Create the approval and delivery status ladder.',
      'Test login, upload, status, and owner handoff.',
    ],
    deliverables: ['tenant portal', 'request desk', 'file/evidence map', 'status view', 'approval record'],
    expansionPath: ['supplier portal', 'support desk', 'document intelligence', 'executive brief'],
    agentJobs: ['summarize client history', 'draft weekly status', 'route requests', 'find missing evidence'],
    objectionResponse:
      'This replaces repeated status chasing first. We can connect deeper systems after the portal proves it saves time.',
  },
  {
    id: 'managed-custom-workflow-app',
    name: 'Managed Workflow Desk',
    category: 'Managed workflow runtime',
    targetBuyer: 'Founder, COO, operations leader, or tech-forward manager',
    promise: 'Deploy reviewed work lanes that research, clean data, draft reports, prepare actions, and wait for approval without exposing automation controls to users.',
    qualifyingPain: 'People spend hours reading files, summarizing, reconciling, and preparing work before a manager can decide.',
    starterPrice: 'USD 3,500 to USD 7,500',
    pilotPrice: 'USD 12,000 to USD 30,000',
    retainerPrice: 'USD 3,000 per month plus',
    firstWorkflow: 'One prepared job with a source list, output template, review gate, and audit record.',
    proofRoute: '/app/cloud-agent-army',
    sourceInputs: ['source files', 'task examples', 'approval rules', 'known failure cases'],
    implementationChecklist: [
      'Scope automation tools to only required systems.',
      'Separate read, draft, and action permissions.',
      'Add prompt-injection and source-trust review.',
      'Store run history, source links, and reviewer decisions.',
      'Require human approval before external write/send actions.',
    ],
    deliverables: ['automation charter', 'tool access map', 'run log', 'review queue', 'safety checklist'],
    expansionPath: ['multi-lane pods', 'browser workflows', 'mobile operator inbox', 'managed operations'],
    agentJobs: ['research accounts', 'clean workbooks', 'draft outreach', 'prepare board report', 'monitor source changes'],
    objectionResponse:
      'The point is controlled delegation, not blind automation. The system drafts and prepares; humans approve the actions that matter.',
  },
  {
    id: 'agentic-integration',
    name: 'Integration Studio',
    category: 'R&D and platform acceleration',
    targetBuyer: 'Founder, product lead, automation operator, or technical manager',
    promise: 'Turn useful open-source stacks into one governed pilot with tests, tool policy, and a clear module promotion path.',
    qualifyingPain: 'The team wants browser automation, code sandboxes, document intelligence, or tool integrations but does not know which stack is safe or useful.',
    starterPrice: 'USD 2,500 to USD 6,000',
    pilotPrice: 'USD 8,000 to USD 20,000',
    retainerPrice: 'USD 2,000 per month plus',
    firstWorkflow: 'One integration pilot mapped to a real business workflow, source sample, and review gate.',
    proofRoute: '/app/integration-studio',
    sourceInputs: ['target workflow', 'tool candidates', 'source samples', 'approval rules', 'failure cases'],
    implementationChecklist: [
      'Score candidate tools against the workflow and buyer risk.',
      'Check license, hosting, data, and security constraints.',
      'Create one guarded pilot with source scope and allowed tools.',
      'Generate acceptance checks, rejection criteria, and rollback rule.',
      'Promote only the useful pilot into the client module plan.',
    ],
    deliverables: ['tool stack radar', 'pilot contract', 'tool policy', 'acceptance checks', 'module promotion memo'],
    expansionPath: ['browser worker kit', 'knowledge cleanroom', 'automation dev factory', 'managed operations'],
    agentJobs: ['rank repos', 'draft pilot spec', 'write acceptance tests', 'flag policy risk', 'prepare productization note'],
    objectionResponse:
      'We are not selling random tools. We test one stack against one workflow and only promote it when the acceptance checks prove it saves work safely.',
  },
  {
    id: 'document-intake',
    name: 'Document Intake',
    category: 'Document intake product',
    targetBuyer: 'Owner, analyst, operations manager, plant manager, or knowledge-heavy service team',
    promise: 'Turn messy files, sheets, emails, and operational records into source-backed rows, review queues, and decision-ready insight.',
    qualifyingPain: 'The company has data everywhere but cannot trust one answer, source, or KPI story.',
    starterPrice: 'USD 3,000 to USD 6,000',
    pilotPrice: 'USD 10,000 to USD 25,000',
    retainerPrice: 'USD 2,500 per month plus',
    firstWorkflow: 'Source register, cleanup queue, KPI candidate review, and insight brief.',
    proofRoute: '/app/data-fabric',
    sourceInputs: ['Drive folder', 'sample workbooks', 'document register', 'KPI definitions', 'manager questions'],
    implementationChecklist: [
      'Create source register and data-owner map.',
      'Classify trusted, stale, duplicate, and sensitive records.',
      'Extract entities, dates, amounts, statuses, and operational facts.',
      'Create a quality review queue before insight publishing.',
      'Tie every insight to source evidence and next action.',
    ],
    deliverables: ['source register', 'data quality board', 'entity map', 'KPI review pack', 'visual story brief'],
    expansionPath: ['predictive insights', 'agent-ready memory', 'department portals', 'executive command center'],
    agentJobs: ['classify files', 'extract workbook metrics', 'flag stale sources', 'draft insight narrative'],
    objectionResponse:
      'We do not need perfect data to start. We expose what is trusted, what is missing, and where the first operating insight lives.',
  },
  {
    id: 'industry-os',
    name: 'Industry Operating System Kits',
    category: 'Vertical kits',
    targetBuyer: 'Factory owner, restaurant owner, clinic operator, distributor, or service-group leader',
    promise: 'Launch a tailored operating portal for the industry without starting from a blank custom-software project.',
    qualifyingPain: 'The business wants software that matches its real work instead of forcing staff into generic SaaS.',
    starterPrice: 'USD 2,500 to USD 6,000',
    pilotPrice: 'USD 8,000 to USD 25,000',
    retainerPrice: 'USD 2,000 per month plus',
    firstWorkflow: 'Choose the industry wedge: Plant Daily Brief, Restaurant POS + Inventory Desk, Service Desk, or Sales Desk.',
    proofRoute: '/app/portal-factory',
    sourceInputs: ['industry workflow samples', 'role list', 'daily records', 'current forms', 'reporting cadence'],
    implementationChecklist: [
      'Pick one industry kit and one first module.',
      'Define roles and daily operating rhythm.',
      'Map required sources and exception types.',
      'Configure templates, review states, and proof artifacts.',
      'Run one operating day with the client team.',
    ],
    deliverables: ['industry portal kit', 'role workspace', 'operating checklist', 'starter dashboard', 'launch handoff'],
    expansionPath: ['custom ERP replacement', 'AI agent workforce', 'tenant network', 'managed operations'],
    agentJobs: ['prepare daily brief', 'normalize menu or SKU data', 'draft manager actions', 'surface exceptions'],
    objectionResponse:
      'We are not selling generic software. We start from your actual daily operating rhythm and build the smallest useful system around it.',
  },
]

export const COMMERCIAL_PERSONAS: CommercialPersona[] = [
  {
    id: 'owner',
    name: 'The overloaded owner',
    buyerTitle: 'Founder, owner, CEO, or family-business operator',
    urgentMoment: 'They ask for status repeatedly because nobody has one reliable operating view.',
    buyingTrigger: 'A missed customer follow-up, delayed approval, bad handover, or upcoming investor/client meeting.',
    emotionalFrame: 'Control without micromanaging.',
    firstOffer: 'Back Office Workflow Desk',
    proofNeeded: 'A same-week screen showing their actual workflow, files, owners, and next actions.',
  },
  {
    id: 'operations-manager',
    name: 'The practical operations manager',
    buyerTitle: 'Operations, warehouse, plant, branch, or service manager',
    urgentMoment: 'They are coordinating people through chat and spreadsheets because systems do not match the work.',
    buyingTrigger: 'Repeat exceptions, lost files, poor shift handover, or management asking for cleaner reports.',
    emotionalFrame: 'Less chasing, clearer ownership.',
    firstOffer: 'Back Office Workflow Desk or Factory Operations App',
    proofNeeded: 'A daily action board with owner, due date, evidence, and blocker state.',
  },
  {
    id: 'sales-leader',
    name: 'The revenue owner',
    buyerTitle: 'Founder-led sales lead, distributor owner, or account manager',
    urgentMoment: 'Leads, outreach, follow-up, and account memory are split across tabs and inboxes.',
    buyingTrigger: 'Pipeline is unclear, follow-up is inconsistent, or a new growth push needs structure.',
    emotionalFrame: 'More response without sounding robotic.',
    firstOffer: 'Sales Desk and Growth Machine',
    proofNeeded: 'A target account queue, outreach draft, follow-up task, and proof asset.',
  },
  {
    id: 'data-leader',
    name: 'The data-trapped manager',
    buyerTitle: 'Analyst, finance lead, quality lead, or reporting owner',
    urgentMoment: 'They have many files but cannot answer which number is current or trusted.',
    buyingTrigger: 'Board review, audit prep, KPI drift, source changes, or recurring spreadsheet cleanup.',
    emotionalFrame: 'Trustworthy answers with visible evidence.',
    firstOffer: 'Data Fabric and Knowledge Engine',
    proofNeeded: 'Source register, data quality queue, and an insight card tied to the original file.',
  },
]

export const COMMERCIAL_SOLUTION_BLUEPRINTS: CommercialSolutionBlueprint[] = [
  {
    id: 'factory-operator',
    name: 'Factory or warehouse operator',
    buyerSituation: 'Plant, warehouse, QC, receiving, or maintenance work is split across paper, chat, Excel, and manager memory.',
    whatTheyThinkTheyWant: 'ERP, dashboard, QC system, maintenance app, or AI report generator.',
    whatTheyActuallyNeed: 'One daily operating surface that shows exceptions, owner, evidence, due date, and review state before deeper ERP replacement.',
    primaryOfferId: 'industry-os',
    priceTierId: 'business-os-pilot',
    firstScreen: 'Plant Daily Brief or Operations Exception Desk.',
    discoveryQuestions: [
      'Which issue gets chased every day: receiving, QC hold, maintenance, production update, or delivery?',
      'Who must see the first screen every morning?',
      'Which current sheets, forms, photos, and manager notes prove the state of work?',
      'Which actions are safe to draft, and which require manager approval?',
    ],
    sourceChecklist: ['sample daily report', 'issue log or Excel sheet', 'role list', 'photos/documents examples', 'approval rules'],
    setupSteps: [
      'Map one operating day.',
      'Create the first issue queue and owner roles.',
      'Attach source evidence and review states.',
      'Run one manager review with sample data.',
      'Package the next module after usage is proven.',
    ],
    proposalOpening:
      'We will start with one factory operating desk that shows today’s exceptions, owner, source evidence, next action, and review state before expanding into ERP or agent automation.',
    proofRoute: '/app/plant-os',
    upsellPath: ['data fabric', 'maintenance desk', 'DQMS desk', 'agent daily brief', 'ERP action layer'],
    decisionRisk: 'Do not lead with broad ERP replacement. Sell the first operating day and keep writeback human-approved.',
  },
  {
    id: 'owner-led-sales',
    name: 'Owner-led sales or distributor team',
    buyerSituation: 'Quotes, stock checks, customer follow-up, delivery promises, and payment reminders depend on people remembering.',
    whatTheyThinkTheyWant: 'CRM, sales dashboard, WhatsApp bot, ecommerce site, or automated follow-up.',
    whatTheyActuallyNeed: 'A sales follow-up desk with account memory, next action, evidence, quote status, and reviewed outreach drafts.',
    primaryOfferId: 'workflow-desk',
    priceTierId: 'starter-sprint',
    firstScreen: 'Quote and delivery follow-up desk.',
    discoveryQuestions: [
      'Where do leads and customer requests arrive today?',
      'Which follow-ups are most expensive when missed?',
      'What fields define a useful quote, stock check, or delivery promise?',
      'Who approves pricing, discount, or collection messages?',
    ],
    sourceChecklist: ['lead list', 'sample quote', 'customer message examples', 'stock or price file', 'follow-up stages'],
    setupSteps: [
      'Create lead and follow-up stages.',
      'Attach quote, stock, and delivery evidence.',
      'Create reviewed outreach templates.',
      'Log replies and next actions.',
      'Turn repeated objections into offer improvements.',
    ],
    proposalOpening:
      'We will launch one sales operating desk for the customer follow-up workflow: lead, owner, quote evidence, next step, approval state, and reviewed response draft.',
    proofRoute: '/app/revenue',
    upsellPath: ['lead finder', 'growth machine', 'client portal', 'data fabric', 'managed AI ops'],
    decisionRisk: 'Do not auto-send messages until OAuth, unsubscribe, rate limits, and audit logs are explicit.',
  },
  {
    id: 'service-business',
    name: 'Service business, clinic, spa, or branch team',
    buyerSituation: 'Bookings, staff work, customer notes, daily cash, inventory, and repeat follow-up live in separate notebooks, apps, and chats.',
    whatTheyThinkTheyWant: 'POS, booking system, simple website, Facebook automation, or staff tracker.',
    whatTheyActuallyNeed: 'A day-ledger service desk that staff can use immediately, then expand into customer follow-up and branch reporting.',
    primaryOfferId: 'industry-os',
    priceTierId: 'starter-sprint',
    firstScreen: 'Service Desk daily ledger.',
    discoveryQuestions: [
      'What happens from customer booking to payment and daily close?',
      'Which staff member owns each service, sale, or follow-up?',
      'Which reports does the owner ask for every day or week?',
      'Which customer messages should be drafted but reviewed before sending?',
    ],
    sourceChecklist: ['service menu', 'staff list', 'price list', 'sample booking records', 'daily close format'],
    setupSteps: [
      'Load services, staff, and prices.',
      'Create today ledger and daily close summary.',
      'Add customer follow-up states.',
      'Create owner review screen.',
      'Package branch or customer portal expansion.',
    ],
    proposalOpening:
      'We will start with one service desk for today’s appointments, sales, staff ownership, daily close, and customer follow-up before adding larger CRM or POS scope.',
    proofRoute: '/app/service-desk',
    upsellPath: ['booking portal', 'customer follow-up', 'inventory pulse', 'branch dashboard', 'managed AI ops'],
    decisionRisk: 'Keep first screen simple enough for non-technical staff. Avoid heavy dashboard language.',
  },
  {
    id: 'b2b-client-service',
    name: 'B2B service firm or internal department',
    buyerSituation: 'Clients and managers ask for status because requests, files, approvals, and delivery notes are scattered.',
    whatTheyThinkTheyWant: 'Client portal, project management tool, document AI, ticketing system, or dashboard.',
    whatTheyActuallyNeed: 'A branded request and delivery room with role access, evidence, status, approvals, and weekly client-ready updates.',
    primaryOfferId: 'client-portal',
    priceTierId: 'business-os-pilot',
    firstScreen: 'Client request and delivery portal.',
    discoveryQuestions: [
      'Which client request types repeat most often?',
      'Which files or approvals block delivery?',
      'Which statuses does the client need to see without calling?',
      'Who can see internal notes versus client-visible notes?',
    ],
    sourceChecklist: ['client list', 'request form', 'delivery status examples', 'folder structure', 'approval roles'],
    setupSteps: [
      'Define tenant/client boundaries.',
      'Create request intake and delivery states.',
      'Map private versus client-visible evidence.',
      'Create weekly status template.',
      'Run one client handoff test.',
    ],
    proposalOpening:
      'We will launch one branded client room for requests, source files, approvals, delivery status, and weekly updates so the team stops repeating status manually.',
    proofRoute: '/products/client-portal',
    upsellPath: ['document intake', 'support desk', 'agent weekly brief', 'executive client dashboard', 'managed AI ops'],
    decisionRisk: 'Role visibility must be correct before using real client data. Do not expose private tenant details on the public site.',
  },
  {
    id: 'data-reporting',
    name: 'Data-trapped reporting or quality team',
    buyerSituation: 'The company has workbooks, reports, Drive folders, PDFs, and chat files but no trusted answer or source-backed KPI story.',
    whatTheyThinkTheyWant: 'BI dashboard, data warehouse, chatbot over files, or AI analyst.',
    whatTheyActuallyNeed: 'A source register and data-quality board that separates trusted evidence from stale, duplicate, missing, or risky data.',
    primaryOfferId: 'data-fabric',
    priceTierId: 'business-os-pilot',
    firstScreen: 'Source register and KPI review board.',
    discoveryQuestions: [
      'Which number is most argued about?',
      'Which files are source of truth, and which are copies or exports?',
      'Who approves a KPI definition?',
      'What decision should the first insight support?',
    ],
    sourceChecklist: ['Drive/folder sample', 'main workbook', 'KPI list', 'report screenshots', 'data owner list'],
    setupSteps: [
      'Build source register.',
      'Classify records by trust and freshness.',
      'Extract candidate entities and metrics.',
      'Create KPI review queue.',
      'Publish one source-backed insight brief.',
    ],
    proposalOpening:
      'We will start by turning the current files into a source register, data quality queue, KPI review pack, and one evidence-backed insight before building deeper BI or AI analysis.',
    proofRoute: '/app/data-fabric',
    upsellPath: ['knowledge engine', 'executive insight brief', 'agent research worker', 'forecasting', 'department portals'],
    decisionRisk: 'Do not promise perfect answers before source trust is visible. Sell evidence and review first.',
  },
  {
    id: 'ai-tool-builder',
    name: 'AI tool builder or R&D buyer',
    buyerSituation: 'The team is overwhelmed by AI frameworks, GitHub repos, browser agents, MCP tools, and document AI but still needs a production workflow.',
    whatTheyThinkTheyWant: 'LangChain, agent framework, browser agent, code interpreter, RAG stack, or custom AI app.',
    whatTheyActuallyNeed: 'A governed integration pilot with tool policy, acceptance checks, source scope, and a promotion path into one business module.',
    primaryOfferId: 'agentic-integration',
    priceTierId: 'starter-sprint',
    firstScreen: 'Integration Studio pilot board.',
    discoveryQuestions: [
      'Which workflow should the tool improve first?',
      'Which source inputs and systems can the agent read?',
      'Which actions are draft-only versus allowed after approval?',
      'Which failures would make the pilot unsafe or not worth shipping?',
    ],
    sourceChecklist: ['workflow recording or screenshots', 'sample files', 'tool candidate list', 'approval rules', 'known failure examples'],
    setupSteps: [
      'Score the tool candidates.',
      'Create the guarded pilot contract.',
      'Run acceptance checks on safe sample data.',
      'Reject or promote the stack.',
      'Attach the accepted stack to the product module plan.',
    ],
    proposalOpening:
      'We will turn the AI tool idea into one governed pilot: source scope, allowed tools, acceptance checks, review gate, and a module promotion path.',
    proofRoute: '/app/integration-studio',
    upsellPath: ['agent workforce', 'knowledge engine', 'client portal module', 'managed AI ops'],
    decisionRisk: 'Do not give agents broad tool access or client data until source scope, policy, and review gates are explicit.',
  },
]

export const COMMERCIAL_CHECKLISTS: CommercialChecklist[] = [
  {
    id: 'qualification',
    name: 'Lead qualification',
    owner: 'Sales agent plus founder review',
    items: [
      'Buyer owns a real workflow, budget, or decision path.',
      'Pain happens weekly or daily, not someday.',
      'There are real source files, messages, forms, exports, or screenshots.',
      'A first workflow can be demonstrated in 1 to 3 weeks.',
      'The client accepts human approval before agent write/send actions.',
      'The first value can be explained in one sentence.',
    ],
  },
  {
    id: 'discovery',
    name: 'Discovery call',
    owner: 'Founder',
    items: [
      'Ask what work keeps getting chased manually.',
      'Ask which role feels the pain most.',
      'Ask what files, messages, systems, and reports are used today.',
      'Ask what happens when the workflow fails.',
      'Ask who approves changes and who must use the first screen.',
      'End with one proposed wedge, price band, and data request.',
    ],
  },
  {
    id: 'proposal',
    name: 'Proposal pack',
    owner: 'Sales operator',
    items: [
      'One buyer and one outcome on page one.',
      'Scope is one first workflow plus optional expansion.',
      'Pricing tier and assumptions are explicit.',
      'Data/source access list is included.',
      'Security and review gates are listed.',
      'Go-live checklist and acceptance criteria are defined.',
    ],
  },
  {
    id: 'agent-safety',
    name: 'Agent safety gate',
    owner: 'Agent operations lead',
    items: [
      'Sandbox file and command access for build or data tasks.',
      'Treat web pages, emails, documents, and tool outputs as untrusted inputs.',
      'Scope MCP/tool access to the smallest useful permission set.',
      'Review persistent memory before using it for decisions.',
      'Separate multi-agent handoffs with evidence and reviewer checkpoints.',
      'Log every external write, send, delete, or update action.',
    ],
  },
  {
    id: 'integration-pilot',
    name: 'Integration pilot gate',
    owner: 'Integration Systems plus founder review',
    items: [
      'Tool exists in the radar with source, license posture, and adoption decision.',
      'Pilot maps to one buyer workflow, not a generic technology showcase.',
      'Allowed tools, source scope, output type, and review gate are documented.',
      'Acceptance checks prove value and safety before promotion.',
      'Rejected tools keep a rejection reason so the team does not repeat the same research.',
      'Promoted pilots become a module route, product story, or internal runtime improvement.',
    ],
  },
  {
    id: 'go-live',
    name: 'Go-live',
    owner: 'Delivery lead',
    items: [
      'Login and role access checked.',
      'First workflow works with real seed data.',
      'Client can find the next action in under one minute.',
      'Manager review template is ready.',
      'Support and change-request route is clear.',
      'Follow-up retainer or next module is proposed.',
    ],
  },
]

export const COMMERCIAL_AGENT_TEAM: CommercialAgentSeat[] = [
  {
    id: 'market-research',
    name: 'Market research agent',
    mission: 'Find target accounts, sector pain, buying triggers, and first-workflow hypotheses.',
    tools: ['web research', 'public site review', 'lead ledger', 'market notes'],
    output: 'Account brief with fit score, likely workflow pain, and first message angle.',
    reviewGate: 'Founder approves before outreach.',
  },
  {
    id: 'offer-architect',
    name: 'Offer architect agent',
    mission: 'Translate messy demand into one sellable workflow, price tier, source list, and scope boundary.',
    tools: ['commercial offer system', 'product catalog', 'proposal checklist', 'pricing ladder'],
    output: 'Offer card, discovery questions, and scope paragraph.',
    reviewGate: 'Founder approves price and scope before sending.',
  },
  {
    id: 'content',
    name: 'Content and social agent',
    mission: 'Draft LinkedIn, Facebook, X, and founder notes from real product proof and objections.',
    tools: ['post queue', 'proof assets', 'website copy', 'objection log'],
    output: 'Reviewed post queue with asset, CTA, and channel.',
    reviewGate: 'Manual approval required until LinkedIn/Facebook connectors are authorized.',
  },
  {
    id: 'sales-follow-up',
    name: 'Sales follow-up agent',
    mission: 'Prepare replies, next-step tasks, meeting briefs, and follow-up messages.',
    tools: ['Gmail drafts', 'lead pipeline', 'workspace tasks', 'calendar notes'],
    output: 'Draft response and task update.',
    reviewGate: 'Human sends or edits every outbound message.',
  },
  {
    id: 'client-vision',
    name: 'Client vision analyst',
    mission: 'Analyze buyer psychology, resistance, adoption risk, and expansion path.',
    tools: ['call notes', 'persona model', 'objection log', 'product roadmap'],
    output: 'Decision memo: what the buyer really wants, what they fear, and the best first proof.',
    reviewGate: 'Founder decides whether to adjust offer, price, or target segment.',
  },
  {
    id: 'integration-architect',
    name: 'Integration architect agent',
    mission: 'Turn open-source tool research into governed pilots, acceptance checks, and module promotion plans.',
    tools: ['open-source radar', 'integration studio', 'agent workbench', 'policy checklist'],
    output: 'Pilot contract with selected tools, rejection reasons, risks, tests, and promotion path.',
    reviewGate: 'Founder and Module Factory approve before client-facing use.',
  },
]

export const COMMERCIAL_TEMPLATES: CommercialTemplate[] = [
  {
    id: 'one-line-pitch',
    name: 'One-line pitch',
    channel: 'Sales call',
    body:
      'SuperMega builds one working operating desk for the workflow your team keeps chasing manually, then expands it into a client portal, data fabric, and reviewed AI agent workforce.',
  },
  {
    id: 'linkedin-founder',
    name: 'LinkedIn founder post',
    channel: 'LinkedIn',
    body:
      'Most teams do not need another dashboard. They need one place where the actual work is visible: owner, file, status, approval, next action. That is the first SuperMega offer: send one messy workflow and we turn it into a working desk before expanding into agents or ERP replacement. https://supermega.dev/contact',
  },
  {
    id: 'facebook-owner',
    name: 'Facebook owner post',
    channel: 'Facebook',
    body:
      'If your team is still chasing tasks through chat, spreadsheets, and repeated calls, send us one workflow. SuperMega turns it into one simple operating screen with owners, files, status, and next actions. Start small, prove value, expand only after it works. https://supermega.dev/contact',
  },
  {
    id: 'cold-outreach',
    name: 'Owner outreach',
    channel: 'Email or LinkedIn DM',
    subject: 'One workflow your team keeps chasing',
    body:
      'Hi {{first_name}}, I noticed {{company}} likely has a lot of work moving through files, messages, and manager follow-up. SuperMega builds one working desk for a painful workflow first: owners, files, status, approvals, and next actions in one place. If you send one workflow that is messy today, I can map the first screen and price band before any big project scope.',
  },
  {
    id: 'discovery-agenda',
    name: 'Discovery call agenda',
    channel: 'Call prep',
    body:
      '1. What workflow keeps getting chased manually? 2. Who owns it today? 3. Which files, messages, and systems are involved? 4. What breaks when it fails? 5. What should the first screen show? 6. Which action needs human approval? 7. Which starter tier fits the urgency?',
  },
  {
    id: 'proposal-scope',
    name: 'Proposal scope paragraph',
    channel: 'Proposal',
    body:
      'We will launch one role-based SuperMega operating desk for {{workflow}}. The first release includes source mapping, role access, workflow states, evidence links, a review queue, and a manager handoff. AI assistance will draft and prepare work, while external sending, writeback, and sensitive decisions remain human-approved.',
  },
  {
    id: 'follow-up',
    name: 'Post-call follow-up',
    channel: 'Email',
    subject: 'First workflow and next step',
    body:
      'Thank you for the call. The clearest first wedge is {{workflow}} for {{team}} because {{pain}}. Next step: please send 2 to 3 sample files/screenshots and the current status fields. I will convert that into a first desk mock, source checklist, price tier, and launch plan.',
  },
]

export const COMMERCIAL_SOCIAL_CADENCE = [
  {
    channel: 'LinkedIn',
    cadence: '2 posts per week',
    job: 'Founder-grade product thinking, one workflow problem, one proof artifact, one CTA.',
  },
  {
    channel: 'Facebook',
    cadence: '1 to 2 posts per week',
    job: 'Plain owner language for Myanmar and service-business buyers.',
  },
  {
    channel: 'Direct outreach',
    cadence: '5 reviewed messages per workday',
    job: 'Targeted owner messages from researched account briefs.',
  },
  {
    channel: 'Proof capture',
    cadence: '1 asset per week',
    job: 'Screenshot, short proof clip, one-page offer, or client workflow map.',
  },
] as const

export const COMMERCIAL_SOCIAL_APPROVAL_POLICY: CommercialSocialApprovalPolicy = {
  status: 'draft_and_review_only',
  canDraft: [
    'LinkedIn founder posts',
    'Facebook owner posts',
    'outreach messages',
    'reply drafts',
    'campaign experiments',
    'proof asset briefs',
  ],
  cannotDoYet: [
    'publish directly to LinkedIn or Facebook',
    'send cold DMs or email without approval',
    'use scraped contacts without consent review',
    'claim client results without proof and permission',
  ],
  publishChecklist: [
    'Post text reviewed by founder.',
    'Claim tied to a real product route or proof asset.',
    'No secrets, private tenant names, customer files, or hidden credentials.',
    'CTA points to supermega.dev contact, pricing, products, or an approved app route.',
    'Posted URL, replies, objections, and next action logged after publishing.',
  ],
  connectorNotes: [
    'Keystore files can be used for readiness checks, but secrets must not be printed or committed.',
    'OAuth clients must stay in test/approval mode until redirect URIs, scopes, and reviewer accounts are explicit.',
    'Automated public posting should wait for account identity, approval workflow, rate limits, and audit ledger.',
  ],
}
