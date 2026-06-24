export type MyanmarProductOpportunity = {
  id: string
  legacyCategory: string
  typicalBuyer: string
  supermegaWedge: string
  firstModule: string
  modules: string[]
  setupInputs: string[]
  proofRoute: string
  priceSignal: string
  whyItWins: string
}

export type GeneralUseToolWedge = {
  id: string
  name: string
  audience: string
  promise: string
  route: string
  inputs: string[]
  output: string
}

export type MyanmarCompetitiveReality = {
  id: string
  buyerQuestion: string
  legacyExpectation: string
  supermegaAnswer: string
}

export type MyanmarPremiumPackage = {
  id: string
  name: string
  buyer: string
  status: 'proof-ready' | 'sprint-ready' | 'next-build'
  oneLine: string
  proofRoute: string
  firstWorkflow: string
  premiumModules: string[]
  onboardingInputs: string[]
  outcomeMetric: string
}

export type ClientIntakeQuestion = {
  id: string
  label: string
  whyItMatters: string
}

export type DeliveryPod = {
  id: string
  name: string
  mandate: string
  output: string
}

export const MYANMAR_COMPETITIVE_REALITY: MyanmarCompetitiveReality[] = [
  {
    id: 'familiar-modules',
    buyerQuestion: 'Can you replace the software categories I already understand?',
    legacyExpectation: 'ERP, POS, HRM, hotel, school, hospital, inventory, accounting, and reports.',
    supermegaAnswer: 'Yes, but we start with one operating workflow and then expand into the modules the client actually uses.',
  },
  {
    id: 'local-rollout',
    buyerQuestion: 'Can my managers learn it without a long ERP project?',
    legacyExpectation: 'Training, local support, data migration, user permissions, and familiar reports.',
    supermegaAnswer: 'Each product ships with login, roles, source register, daily queue, review gate, mobile layout, and a manager handoff.',
  },
  {
    id: 'adaptability',
    buyerQuestion: 'Will this adapt when my forms, folders, and staff workflows change?',
    legacyExpectation: 'Static screens and change requests.',
    supermegaAnswer: 'The source map, checklist, and module contract keep the product adaptable without exposing the automation layer to users.',
  },
]

export const MYANMAR_PREMIUM_PACKAGES: MyanmarPremiumPackage[] = [
  {
    id: 'industrial-plant-os',
    name: 'Factory Operations App',
    buyer: 'Factories, distributors, quality teams, maintenance, owners',
    status: 'proof-ready',
    oneLine: 'A plant manager opens one screen for blockers, CAPA, maintenance, receiving, and owner decisions.',
    proofRoute: '/app/industrial-os',
    firstWorkflow: 'Daily issue closeout with source evidence and owner approval.',
    premiumModules: ['Plant manager home', 'DQMS and CAPA', 'Maintenance reliability', 'Receiving control', 'Executive brief'],
    onboardingInputs: ['ERP or workbook export', 'QC files', 'maintenance log', 'receiving notes', 'manager handoff'],
    outcomeMetric: 'Open high-priority blockers with owner and evidence.',
  },
  {
    id: 'restaurant-pos-desk',
    name: 'Restaurant POS + Inventory',
    buyer: 'Restaurants, cafes, food counters, small retail and service counters',
    status: 'proof-ready',
    oneLine: 'A store owner can run item updates, order/payment proof, cash-up close, shift notes, and owner reporting.',
    proofRoute: '/app/restaurant-os',
    firstWorkflow: 'Daily close with payment proof and manager review.',
    premiumModules: ['Menu and items', 'Orders and payments', 'Cash-up close', 'Shift board', 'Owner report'],
    onboardingInputs: ['Menu PDF or photo', 'payment proof flow', 'cash-up sheet', 'staff roles', 'daily close notes'],
    outcomeMetric: 'Unreconciled value and missing proof at close.',
  },
  {
    id: 'retail-distribution-desk',
    name: 'Retail and Distribution Desk',
    buyer: 'Retail shops, distributors, importers, branch operators',
    status: 'sprint-ready',
    oneLine: 'A manager controls stock issues, supplier claims, returns, sales variance, and branch closeout.',
    proofRoute: '/app/client-build',
    firstWorkflow: 'Stock and supplier exception closeout.',
    premiumModules: ['Stock ledger', 'Sales register', 'Supplier claims', 'Branch variance', 'Daily close'],
    onboardingInputs: ['Inventory sheet', 'sales export', 'supplier invoice', 'returns log', 'branch notes'],
    outcomeMetric: 'Stock variance and supplier claims waiting for owner action.',
  },
  {
    id: 'people-attendance-desk',
    name: 'People and Attendance Desk',
    buyer: 'Factories, restaurants, service teams, branch businesses',
    status: 'next-build',
    oneLine: 'A manager reviews attendance exceptions, leave proof, shift handover, and payroll prep.',
    proofRoute: '/app/client-build',
    firstWorkflow: 'Attendance exception and payroll-prep proof.',
    premiumModules: ['Attendance exceptions', 'Shift handover', 'Leave proof', 'Payroll prep', 'Manager approval'],
    onboardingInputs: ['Attendance export', 'shift roster', 'leave notes', 'payroll workbook', 'manager messages'],
    outcomeMetric: 'Payroll exceptions and missing proof before pay run.',
  },
]

export const MYANMAR_CLIENT_INTAKE_QUESTIONS: ClientIntakeQuestion[] = [
  {
    id: 'workflow',
    label: 'Which daily workflow wastes the most manager time?',
    whyItMatters: 'This chooses the first screen and prevents a giant unfinished ERP scope.',
  },
  {
    id: 'source',
    label: 'Where does the truth live today?',
    whyItMatters: 'Files, Gmail, Sheets, POS exports, PDFs, and screenshots become the source register.',
  },
  {
    id: 'roles',
    label: 'Who enters, reviews, approves, and owns the work?',
    whyItMatters: 'The product becomes role-based instead of another shared spreadsheet.',
  },
  {
    id: 'closeout',
    label: 'What does done look like?',
    whyItMatters: 'Every module needs a close condition, KPI, and evidence trail.',
  },
]

export const DELIVERY_PODS: DeliveryPod[] = [
  {
    id: 'product-architect',
    name: 'Product Architect',
    mandate: 'Turns client pain into one sellable first workflow and module contract.',
    output: 'Package recommendation, role map, source map, and first workflow brief.',
  },
  {
    id: 'implementation-builder',
    name: 'Implementation Builder',
    mandate: 'Builds the client workspace, module screens, route access, and proof-ready data path.',
    output: 'Working screen, QA route, onboarding copy, and handoff notes.',
  },
  {
    id: 'qa-release',
    name: 'QA and Release',
    mandate: 'Checks routes, auth boundaries, mobile layout, proof login, domain split, and protected endpoints.',
    output: 'Go-live evidence, failures, and the next fix before sharing with clients.',
  },
  {
    id: 'market-intel',
    name: 'Market Intelligence',
    mandate: 'Tracks competitor categories, local buyer expectations, and new open-source tooling.',
    output: 'Product gaps, integration candidates, and next premium package to build.',
  },
]

export const MYANMAR_PRODUCT_OPPORTUNITIES: MyanmarProductOpportunity[] = [
  {
    id: 'erp-to-plant-os',
    legacyCategory: 'ERP, distribution, inventory, and accounting suites',
    typicalBuyer: 'Factory owner, COO, plant manager, finance, procurement',
    supermegaWedge: 'Factory Operations App',
    firstModule: 'Receiving and supplier exception control',
    modules: ['Daily brief', 'Receiving control', 'DQMS/CAPA', 'Maintenance reliability', 'Owner brief'],
    setupInputs: ['ERP export', 'supplier email thread', 'receiving photos', 'QC workbook', 'manager note'],
    proofRoute: '/app/industrial-os',
    priceSignal: 'Best enterprise wedge',
    whyItWins: 'Conventional ERP records transactions. This closes the operating exception with evidence, owner, action, and review.',
  },
  {
    id: 'retail-pos-to-store-pay-desk',
    legacyCategory: 'Retail POS, restaurant POS, loyalty, and e-commerce add-ons',
    typicalBuyer: 'Restaurant, cafe, shop, retail counter, service counter',
    supermegaWedge: 'Restaurant POS + Inventory',
    firstModule: 'Orders and payment proof closeout',
    modules: ['Menu and item setup', 'Provider payment setup', 'Payment proof queue', 'Cash-up close', 'Owner daily report'],
    setupInputs: ['menu PDF/photo', 'provider payment link or slip', 'cash-up sheet', 'payment screenshot', 'daily sales note'],
    proofRoute: '/app/restaurant-os',
    priceSignal: 'Fastest proof-to-sale wedge',
    whyItWins: 'Instead of selling a heavy POS replacement first, it fixes the painful closeout and payment evidence loop.',
  },
  {
    id: 'attendance-to-people-desk',
    legacyCategory: 'HR, attendance, payroll preparation, and approval systems',
    typicalBuyer: 'Factory, restaurant group, service business, retail chain',
    supermegaWedge: 'People and Attendance Desk',
    firstModule: 'Attendance exception and shift handover',
    modules: ['Attendance exception queue', 'Shift handover', 'Leave proof', 'Payroll prep', 'Manager approval'],
    setupInputs: ['attendance export', 'shift roster', 'leave note', 'manager message', 'payroll workbook'],
    proofRoute: '/app/actions',
    priceSignal: 'Next horizontal product',
    whyItWins: 'Most small teams do not need full HR first. They need exceptions, approvals, and payroll prep proof.',
  },
  {
    id: 'hotel-hospital-school-to-front-desk',
    legacyCategory: 'Hotel, hospital, school, and membership management systems',
    typicalBuyer: 'Private school, clinic, small hotel, training center, club',
    supermegaWedge: 'Front Desk Control',
    firstModule: 'Booking, admission, payment, and follow-up queue',
    modules: ['Booking intake', 'Payment proof', 'Document checklist', 'Follow-up queue', 'Owner report'],
    setupInputs: ['registration form', 'payment proof', 'customer message', 'document checklist', 'calendar or booking sheet'],
    proofRoute: '/app/service-desk',
    priceSignal: 'Template pack candidate',
    whyItWins: 'The first value is one front-desk queue with evidence and follow-up, not a giant industry suite.',
  },
  {
    id: 'banking-cloud-to-connector-ops',
    legacyCategory: 'Banking software, cloud services, and integration projects',
    typicalBuyer: 'Owner, finance lead, implementation admin',
    supermegaWedge: 'Connector Ops and Source Control',
    firstModule: 'Source register and sync health',
    modules: ['Source register', 'Connector health', 'Change detection', 'Data quality review', 'Agent run ledger'],
    setupInputs: ['Drive folder', 'Gmail labels', 'Sheets', 'CSV exports', 'API credentials through approved env vars'],
    proofRoute: '/app/meta-ops',
    priceSignal: 'Required for enterprise trust',
    whyItWins: 'Every client portal gets safer when source ownership, freshness, and agent permissions are visible.',
  },
]

export const GENERAL_USE_TOOL_WEDGES: GeneralUseToolWedge[] = [
  {
    id: 'menu-to-qr',
    name: 'Menu / Item Setup',
    audience: 'Restaurants, cafes, and shops',
    promise: 'Upload or paste a menu or item list and get a reviewed customer menu plus owner approval.',
    route: '/app/restaurant-os',
    inputs: ['PDF/photo/text menu', 'branch name', 'ordering mode'],
    output: 'customer menu, printable PDF flow, structured item list',
  },
  {
    id: 'payment-close-checker',
    name: 'Payment Close Checker',
    audience: 'Stores using wallet, bank transfer, card, cash, or delivery-platform payment proof',
    promise: 'Turn provider proof and cash-up notes into paid, pending, or reconcile decisions.',
    route: '/app/restaurant-os',
    inputs: ['order refs', 'amounts', 'provider proof', 'settlement refs'],
    output: 'unreconciled value, proof gaps, owner closeout list',
  },
  {
    id: 'supplier-claim-packet',
    name: 'Supplier Claim Packet',
    audience: 'Factories, distributors, and shops',
    promise: 'Turn invoice, receiving note, photos, and email into one claim packet.',
    route: '/app/industrial-os',
    inputs: ['invoice', 'receiving issue', 'photos', 'supplier email'],
    output: 'claim summary, evidence checklist, owner action',
  },
  {
    id: 'daily-owner-brief',
    name: 'Daily Owner Summary',
    audience: 'Any owner-managed business',
    promise: 'Convert the day ledger into the few risks and decisions the owner should see.',
    route: '/app/ai-workflow-desk',
    inputs: ['tasks', 'payments', 'notes', 'source changes'],
    output: 'owner brief, open decisions, missing evidence',
  },
]
