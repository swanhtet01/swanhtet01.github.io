export type ProductizedOffer = {
  id: string
  name: string
  buyer: string
  firstValue: string
  priceSignal: string
  proofRoute: string
  portalKit: string
  delivery: string[]
  modules: string[]
  agentJobs: string[]
  closeScript: string
}

export type NextSellableProduct = {
  id: string
  name: string
  buyer: string
  whyNow: string
  firstModule: string
  proofRoute: string
  sellAs: string
  buildNext: string
}

export const PRODUCTIZED_OFFER_POSITIONING = {
  publicOffer: 'Back Office Workflow Desk, Factory Operations App, and Restaurant POS + Inventory',
  publicRule: 'Clients name one painful file, spreadsheet, inbox, counter, factory, or service workflow. SuperMega sells the first useful screen, then expands only after proof.',
  internalRule: 'The public product set is Back Office Workflow Desk, Factory Operations App, and Restaurant POS + Inventory. Document Extraction Ledger, Client Room, live-state monitoring, and build review are shared delivery modules inside serious builds, not separate confusing top-level products.',
} as const

export const PRODUCTIZED_OFFERS: ProductizedOffer[] = [
  {
    id: 'workflow-app-sprint',
    name: 'Back Office Workflow Desk',
    buyer: 'Owner, operator, admin, finance, sales, support, or manager with one repeated manual workflow',
    firstValue: 'One governed operations app that turns a source-heavy workflow into a queue, prepared work, approval gates, and a proof pack.',
    priceSignal: 'Flagship wedge because every custom SaaS or agent project needs a deployed workflow before broad automation.',
    proofRoute: '/products/agentops-toolbox',
    portalKit: 'Back Office Workflow Desk',
    delivery: ['workflow map', 'source register', 'prepared work queue', 'step checklist', 'approval policy', 'proof pack'],
    modules: ['Client Room', 'Document Extraction Ledger', 'Prepared Work Queue', 'Step Review', 'Approval Gate', 'Evidence Pack'],
    agentJobs: ['map source inputs', 'normalize records', 'draft work queue', 'stage browser steps', 'prepare proof pack'],
    closeScript: 'Send one painful workflow, five source samples, and the approval owner. We turn it into a governed operations app with proof before expansion.',
  },
  {
    id: 'industrial-plant-os-sprint',
    name: 'Factory Operations App',
    buyer: 'Factory owner, plant manager, operations lead',
    firstValue: 'One role-based plant desk that makes today\'s blockers, evidence, follow-up, and owner decisions visible.',
    priceSignal: 'High-ticket pilot because it replaces spreadsheets, chat escalation, and management review prep.',
    proofRoute: '/app/factory-operations',
    portalKit: 'Factory Operations App',
    delivery: ['Week 1 source map', 'Week 2 role desks', 'Week 3 review packets', 'Week 4 management review'],
    modules: ['WCM Daily Control', 'ISO Evidence', 'DQMS/CAPA', 'Maintenance Reliability', 'Supplier Follow-up', 'Owner Review'],
    agentJobs: ['draft action packet', 'cluster repeat issues', 'prepare supplier follow-up', 'write owner brief'],
    closeScript: 'We start with one daily review loop and make every carryover owned, sourced, and reviewable.',
  },
  {
    id: 'operations-digital-twin-sprint',
    name: 'Factory Live State',
    buyer: 'Factory, facility, warehouse, or energy lead with one machine, meter, line, or recurring maintenance decision',
    firstValue: 'One live factory-state module that combines meter readings, asset state, source evidence, anomaly flags, and manager actions.',
    priceSignal: 'Enterprise wedge because it turns SuperMega from custom dashboards into physical-operations software with recurring monitoring revenue.',
    proofRoute: '/app/factory-operations',
    portalKit: 'Factory Operations App',
    delivery: ['asset map', 'meter/source plan', 'telemetry lane', 'state dashboard', 'anomaly review', 'mobile action capture'],
    modules: ['Asset Twin', 'Smart Meter Lane', 'Telemetry History', 'Anomaly Queue', 'Manager Action Board'],
    agentJobs: ['validate readings', 'detect anomalies', 'attach source evidence', 'draft maintenance or energy actions', 'prepare owner brief'],
    closeScript: 'Start with one asset or meter. We build the live-state lane, reading history, anomaly queue, and manager action path before expanding sensors.',
  },
  {
    id: 'restaurant-pos-sprint',
    name: 'Restaurant POS + Inventory',
    buyer: 'Restaurant, cafe, shop, or service-counter owner',
    firstValue: 'Upload menus, item lists, payment proof, and closeout notes, then run orders, cash-up, shifts, stock, and owner review from one desk.',
    priceSignal: 'Fast low-friction offer; sells as a practical upgrade before a heavy POS or ERP rollout.',
    proofRoute: '/app/restaurant-pos',
    portalKit: 'Restaurant POS + Inventory',
    delivery: ['item setup', 'order capture', 'payment proof capture', 'cash-up close', 'owner daily report'],
    modules: ['Menu and Items', 'Orders and Payments', 'Shift Control', 'Prep Stock Waste', 'Owner Report'],
    agentJobs: ['extract item list', 'normalize prices', 'check payment proof', 'flag cash-up gaps', 'draft owner report'],
    closeScript: 'Send the current menu or item list and payment close flow. We turn it into one reviewed POS screen for orders, payment proof, and owner daily close.',
  },
  {
    id: 'portal-launch-sprint',
    name: 'Workspace Setup',
    buyer: 'Founder, admin, operations manager, client owner',
    firstValue: 'Answer a short checklist and get a working workspace plan: login, roles, modules, source inputs, prepared checks, review gates, and go-live checks.',
    priceSignal: 'Universal entry offer because every client needs a clear first module before custom ERP scope expands.',
    proofRoute: '/app/client-build',
    portalKit: 'Workspace Setup Engine',
    delivery: ['Client room', 'Client build brief', 'module plan', 'role access', 'source map', 'go-live QA'],
    modules: ['Login and roles', 'Client Room', 'Client Build Intake', 'Module Registry', 'Source Intake', 'Review Queue', 'QA Checklist'],
    agentJobs: ['generate portal manifest', 'choose first wedge', 'map source inputs', 'draft proof script', 'run module readiness check'],
    closeScript: 'Send the company type, roles, source files, and the workflow that hurts most. We turn it into the first portal build plan and proof workspace.',
  },
  {
    id: 'agentic-integration-sprint',
    name: 'Integration Sprint',
    buyer: 'Founder, technical operator, product lead, or company with messy browser/file workflows',
    firstValue: 'Rank the right open-source tools, run one guarded pilot, and ship the accepted stack into a working module instead of chasing random repos.',
    priceSignal: 'High-leverage R&D offer; sells when the client wants automation but needs safety, tests, and a real workflow first.',
    proofRoute: '/app/integration-studio',
    portalKit: 'Integration Studio',
    delivery: ['repo and workflow radar', 'tool policy', 'guarded pilot', 'acceptance checks', 'module promotion plan'],
    modules: ['Open Source Radar', 'Integration Studio', 'Work Review', 'Policy Control', 'Module Readiness'],
    agentJobs: ['score candidate repos', 'draft pilot contract', 'generate acceptance checks', 'flag license risk', 'prepare module promotion'],
    closeScript: 'Send one workflow, one source sample, and the tools you are considering. We choose the stack, test it safely, and promote only what improves the product.',
  },
]

export const PRODUCTIZED_OFFER_SEQUENCE = [
  'Lead with Back Office Workflow Desk, Factory Operations App, or Restaurant POS + Inventory; use the workflow desk lane when a client brings a process that does not fit the factory or counter workflows.',
  'Ask which SaaS, spreadsheet, inbox loop, browser portal, or staff workflow should be replaced first.',
  'Choose the internal proof kit after the client names the pain.',
  'Promote the useful workflow into a portal kit.',
  'Add automation only where it saves clerical time with a review gate.',
] as const

export const NEXT_SELLABLE_PRODUCTS: NextSellableProduct[] = [
  {
    id: 'easy-erp-starter',
    name: 'Factory Operations Starter',
    buyer: 'Factory, warehouse, distributor, restaurant group, or service business with records split across sheets and chat',
    whyNow: 'Owners understand ERP pain faster than abstract portals: item lists, stock movement, purchase requests, orders, approvals, and audit history are immediate.',
    firstModule: 'Role-safe inventory or purchase ledger',
    proofRoute: '/app/erp',
    sellAs: 'Paid Factory Operations starter sprint',
    buildNext: 'Connect Client Room, source register, item master, stock movement, approval queue, export-ready records, and handoff pack.',
  },
  {
    id: 'cloud-agent-army',
    name: 'Hosted Operations',
    buyer: 'SuperMega founder/operator and later high-value clients with multiple workflows',
    whyNow: 'The $100k path needs hosted queues that keep prospecting, intake, build packets, QA, and proof packs moving without relying on a local computer.',
    firstModule: 'Cloud-scheduled, queue-backed dispatch board',
    proofRoute: '/app/cloud-agent-army',
    sellAs: 'Managed Workflow Desk after the first Back Office Workflow Desk, Factory Operations App, or Restaurant POS + Inventory proof',
    buildNext: 'Activate Vercel/Cloud Tasks orchestration, agent run queues, approval records, and weekly proof reporting.',
  },
  {
    id: 'industrial-daily-brief',
    name: 'Industrial Daily Brief',
    buyer: 'Factory owner or plant manager',
    whyNow: 'It is the fastest path to value because it turns existing logs, emails, and sheets into one daily decision page.',
    firstModule: 'Executive Decision Brief',
    proofRoute: '/app/daily-brief',
    sellAs: 'Paid 2-week plant review sprint',
    buildNext: 'Automated source-change watcher that opens CAPA, maintenance, receiving, or CEO review items.',
  },
  {
    id: 'operations-digital-twin',
    name: 'Factory Live State',
    buyer: 'Factory, facility, warehouse, or energy lead',
    whyNow: 'ESP32 prototypes, certified meters, MQTT, and AI review make it possible to show live operations without waiting for a full ERP or SCADA replacement.',
    firstModule: 'Asset Twin + Smart Meter Lane',
    proofRoute: '/app/factory-operations',
    sellAs: 'Paid factory twin starter sprint',
    buildNext: 'Meter/source plan, asset model, telemetry storage, anomaly queue, mobile action capture, and human approval gates.',
  },
  {
    id: 'menu-to-qr-os',
    name: 'Restaurant POS + Inventory',
    buyer: 'Restaurant, cafe, shop, or service-counter owner',
    whyNow: 'Small businesses understand the pain immediately: item changes, payment proof, daily close, and end-of-day payment mismatches.',
    firstModule: 'Orders + Payment Proof Control',
    proofRoute: '/app/restaurant-pos',
    sellAs: 'Fixed-price restaurant daily-close sprint',
    buildNext: 'Item upload, OCR extraction, manager approval, order/payment proof capture, and cash-up reconciliation.',
  },
  {
    id: 'source-intake',
    name: 'Document Extraction Ledger',
    buyer: 'Any company with messy PDFs, screenshots, Drive folders, emails, images, or spreadsheet exports',
    whyNow: 'Every serious workflow needs trusted source records before automation, dashboards, or approvals can be believed.',
    firstModule: 'Source intake + source register + exception review',
    proofRoute: '/app/documents',
    sellAs: 'Included document-ledger module inside a paid product sprint',
    buildNext: 'File intake, extracted fields, source evidence, confidence flags, missing-data review, and export-ready records.',
  },
  {
    id: 'portal-launch-sprint',
    name: 'Workspace Setup',
    buyer: 'Any owner who wants a custom portal but does not know what to build first',
    whyNow: 'It turns vague custom-software demand into a small sellable first build with roles, source inputs, modules, prepared checks, and QA gates.',
    firstModule: 'Portal Launch Manifest',
    proofRoute: '/app/client-build',
    sellAs: 'Custom workspace setup sprint',
    buildNext: 'Checklist to module manifest, source map, role policy, proof script, and first live workspace.',
  },
  {
    id: 'agentic-integration-sprint',
    name: 'Integration Sprint',
    buyer: 'Teams that want browser automation, knowledge ingestion, code sandboxes, or evals without unsafe tool sprawl',
    whyNow: 'The market has many powerful open-source tools, but clients need a governed way to select and operationalize them.',
    firstModule: 'Integration Studio Pilot',
    proofRoute: '/app/integration-studio',
    sellAs: 'Paid R&D and module-integration sprint',
    buildNext: 'Repo radar, tool policy, guarded pilot, acceptance checks, and promotion into a client portal module.',
  },
  {
    id: 'workflow-scan-tool',
    name: 'Workflow Scan',
    buyer: 'Any owner or manager with one repeated manual workflow',
    whyNow: 'It is the simplest lead magnet and diagnostic: describe the workflow, sources, owner, frequency, and done state.',
    firstModule: 'Client Build Intake',
    proofRoute: '/intake',
    sellAs: 'Free scan that upgrades into Workflow Desk Deployment Sprint',
    buildNext: 'Turn scan output into recommended portal kit, shared shell, source map, and first module.',
  },
  {
    id: 'manager-action-board',
    name: 'Manager Action Board',
    buyer: 'Any manager coordinating open work across chat, files, and spreadsheets',
    whyNow: 'It creates immediate value without full ERP migration by making owner, evidence, next action, and closeout visible.',
    firstModule: 'Action Board',
    proofRoute: '/app/action-board',
    sellAs: 'Universal manager tool or first paid module',
    buildNext: 'Add clustering, stale work detection, approval gate, and daily owner brief.',
  },
]

export const PRODUCT_STRATEGY_RULES = [
  'Do not make clients choose from a broad menu; lead with Back Office Workflow Desk, Factory Operations App, Factory Live State, or Restaurant POS + Inventory and route custom requests internally.',
  'Do not sell custom software first; sell a narrow replacement outcome sprint.',
  'Do not add a portal type unless it has a buyer, first module, proof route, and repeatable source inputs.',
  'Do not adopt an open-source tool unless it has a use case, license review, acceptance checks, and a human review gate.',
  'Do not let automation write business records directly; stage output with evidence and human review.',
  'Do keep every module tied to one role, one decision, one KPI, and one next action.',
] as const
