export type RevenueProduct = {
  id: string
  name: string
  category: 'wedge' | 'vertical' | 'data' | 'managed'
  buyer: string
  promise: string
  setupFee: number
  monthlyRetainer: number
  targetCustomers: number
  deliveryTime: string
  proofRoute: string
  salesMotion: string
  firstProof: string
  modules: string[]
  upsellPath: string
  marginNote: string
}

export const REVENUE_PRODUCTS: RevenueProduct[] = [
  {
    id: 'workflow-desk-sprint',
    name: 'Workflow Desk Deployment Sprint',
    category: 'wedge',
    buyer: 'Owner or operator who needs the first workflow desk mapped, reviewed, and approved before wider automation.',
    promise: 'One repeated workflow becomes one reviewed queue with owners, source proof, blocked actions, and daily follow-up.',
    setupFee: 1500,
    monthlyRetainer: 350,
    targetCustomers: 20,
    deliveryTime: '3-5 days',
    proofRoute: '/products/?product=back-office-workflow-desk',
    salesMotion: 'Sell after one messy file, folder, screenshot, or repeated task is shared.',
    firstProof: 'A live reviewed queue with sample records, source proof, reviewer routing, and blocked actions.',
    modules: ['Document intake', 'Review queue', 'Owner review', 'Approval gate'],
    upsellPath: 'Use only when the client does not fit Factory Operations App, Factory Operations App Live State, or Restaurant POS + Inventory; then upgrade into the closest product line or Managed Workflow Desk.',
    marginNote: 'High-margin wedge: repeatable setup, small support load, easy annual renewal.',
  },
  {
    id: 'agentops-toolbox',
    name: 'Back Office Workflow Desk',
    category: 'managed',
    buyer: 'Owner-led company, agency, or service business that wants repeated admin, support, research, reporting, CRM, or operations work moved into controlled AI work queues.',
    promise: 'A managed agent operator replaces one repeated back-office job with source intake, drafted output, approval gates, run ledger, and weekly value proof.',
    setupFee: 7500,
    monthlyRetainer: 5000,
    targetCustomers: 20,
    deliveryTime: '5-10 days',
    proofRoute: '/products/?product=back-office-workflow-desk',
    salesMotion: 'Start from one repeated job, five source examples, and the blocked actions that must stay approval-only.',
    firstProof: 'One live managed queue with source proof, drafted work, reviewer decisions, blocked actions, and weekly value ledger.',
    modules: ['Agent scope', 'Source intake', 'Approval queue', 'Run ledger', 'Weekly value report'],
    upsellPath: 'Expand into more workcells, read-only connectors, browser task recording, agency partner rollout, and a private AI Company OS.',
    marginNote: 'Primary $100k MRR lane: 20 managed queues at $5k/month, with setup fees funding onboarding and QA.',
  },
  {
    id: 'factory-desk',
    name: 'Factory Operations Pack',
    category: 'vertical',
    buyer: 'Factory owner, plant manager, or quality lead.',
    promise: 'A daily factory pack for blockers, CAPA, maintenance reliability, receiving, and source evidence.',
    setupFee: 5000,
    monthlyRetainer: 1500,
    targetCustomers: 10,
    deliveryTime: '7-14 days',
    proofRoute: '/products/industrial-plant-os',
    salesMotion: 'Start from production issues, quality exceptions, receiving disputes, or maintenance logs.',
    firstProof: 'One plant lane with issue capture, owner, source evidence, CAPA or receiving decision, and manager closeout.',
    modules: ['Plant manager home', 'Quality CAPA', 'Maintenance reliability', 'Receiving control'],
    upsellPath: 'Expand into Factory Operations App records, Document Extraction Ledger refresh support, supplier dashboards, and a dedicated tenant build.',
    marginNote: 'Best enterprise wedge: urgent operating pain, larger retainers, clear ROI from fewer delays.',
  },
  {
    id: 'easy-erp',
    name: 'Factory Operations App',
    category: 'vertical',
    buyer: 'Factory, warehouse, distributor, restaurant group, or service business with records split across sheets and chat.',
    promise: 'Simple ERP records without the heavy suite: item master, stock movement, purchase queue, customer/order register, approvals, and audit trail.',
    setupFee: 4000,
    monthlyRetainer: 1200,
    targetCustomers: 12,
    deliveryTime: '7-14 days',
    proofRoute: '/app/erp',
    salesMotion: 'Start from one transaction flow such as stock movement, receiving, purchase request, order register, or daily close.',
    firstProof: 'One role-safe ledger with source evidence, status, owner approval, and export-ready records.',
    modules: ['Item master', 'Inventory ledger', 'Purchase queue', 'Customer/order register', 'Approval history'],
    upsellPath: 'Expand into Factory Operations App Live State, Factory Operations Pack, Restaurant POS + Inventory, Document Extraction Ledger refresh support, and managed workflows.',
    marginNote: 'Mid-market wedge: clearer than custom portals and less intimidating than full ERP replacement.',
  },
  {
    id: 'operations-digital-twin',
    name: 'Factory Operations App Live State',
    category: 'vertical',
    buyer: 'Factory, facility, warehouse, or energy-intensive operator with machines, meters, or recurring maintenance work.',
    promise: 'Connect meter readings, machine state, source records, and manager actions into one live factory-twin app.',
    setupFee: 7500,
    monthlyRetainer: 1800,
    targetCustomers: 8,
    deliveryTime: '10-21 days',
    proofRoute: '/products/operations-digital-twin',
    salesMotion: 'Start with one line, one machine, one energy meter, or one recurring maintenance decision.',
    firstProof: 'One asset twin with reading history, anomaly flags, source evidence, owner action, and mobile capture.',
    modules: ['Asset twin', 'Smart meter lane', 'Telemetry history', 'Anomaly queue', 'Manager action board'],
    upsellPath: 'Expand into maintenance, energy optimization, quality traceability, predictive alerts, and managed operations.',
    marginNote: 'High-value wedge: custom software plus hardware/data setup creates defensibility and recurring monitoring revenue.',
  },
  {
    id: 'restaurant-desk',
    name: 'Restaurant POS + Inventory',
    category: 'vertical',
    buyer: 'Restaurant group, cafe operator, or retail food team.',
    promise: 'POS-adjacent operating desk for menu changes, daily cash close, stock/prep control, and guest recovery.',
    setupFee: 750,
    monthlyRetainer: 120,
    targetCustomers: 75,
    deliveryTime: '1-3 days',
    proofRoute: '/products/restaurant-os',
    salesMotion: 'Use a menu PDF, price list, cash close sheet, stock count, or delivery issue as the first source.',
    firstProof: 'A usable menu and daily close board with clear handoff to manager approval.',
    modules: ['Menu manager', 'Daily close', 'Stock and prep', 'Guest recovery'],
    upsellPath: 'Upgrade into QR menu, payment proof, store reporting, loyalty, and multi-branch controls.',
    marginNote: 'Volume product: simple onboarding, low price friction, strong local-market demo value.',
  },
  {
    id: 'source-intake',
    name: 'Document Extraction Ledger',
    category: 'data',
    buyer: 'Team with messy PDFs, Drive folders, invoices, emails, images, or spreadsheet exports.',
    promise: 'Turn untrusted files into clean reviewable records with source links, flags, and owner decisions.',
    setupFee: 2000,
    monthlyRetainer: 500,
    targetCustomers: 15,
    deliveryTime: '5-10 days',
    proofRoute: '/products/?product=document-extraction-ledger',
    salesMotion: 'Ask for one folder or export, then show a source-backed table and exception queue.',
    firstProof: 'A clean register with extracted fields, source evidence, confidence, and missing data flags.',
    modules: ['Source register', 'Field extraction', 'Exception review', 'Export-ready register'],
    upsellPath: 'Attach to any vertical desk as the data layer and charge recurring refresh support.',
    marginNote: 'Strong recurring service layer: every client needs cleanup before automation is trusted.',
  },
  {
    id: 'managed-workflow-retainer',
    name: 'Managed Workflow Desk',
    category: 'managed',
    buyer: 'Company that wants SuperMega to operate the workflow until their team can own it.',
    promise: 'Weekly improvement loop: monitor sources, update screens, chase missing proof, and ship fixes.',
    setupFee: 3000,
    monthlyRetainer: 2500,
    targetCustomers: 5,
    deliveryTime: 'Starts after first sprint',
    proofRoute: '/contact',
    salesMotion: 'Offer after a sprint proves a recurring workflow has real value and recurring maintenance.',
    firstProof: 'A weekly operator brief with changes, blockers, decisions, and next build items.',
    modules: ['Weekly review', 'Module updates', 'Connector checks', 'Manager brief'],
    upsellPath: 'Convert into a full client operating system with multiple departments and role access.',
    marginNote: 'Highest MRR path: sell outcomes, not hours, after the first proof screen is accepted.',
  },
]

export const monthlyRecurringRevenue = (product: RevenueProduct) =>
  product.monthlyRetainer * product.targetCustomers

export const annualRecurringRevenue = (product: RevenueProduct) =>
  monthlyRecurringRevenue(product) * 12

export const firstYearRevenue = (product: RevenueProduct) =>
  annualRecurringRevenue(product) + product.setupFee * product.targetCustomers

export const formatUsd = (amount: number) =>
  `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export const REVENUE_PORTFOLIO_TOTALS = {
  targetCustomers: REVENUE_PRODUCTS.reduce((total, product) => total + product.targetCustomers, 0),
  targetMrr: REVENUE_PRODUCTS.reduce((total, product) => total + monthlyRecurringRevenue(product), 0),
  targetArr: REVENUE_PRODUCTS.reduce((total, product) => total + annualRecurringRevenue(product), 0),
  firstYearRevenue: REVENUE_PRODUCTS.reduce((total, product) => total + firstYearRevenue(product), 0),
}

export const REVENUE_PRODUCT_RULES = [
  'Sell one source-to-screen proof before selling a full platform.',
  'MRR starts only when the monthly job is visible: refresh, review, support, or managed improvement.',
  'ARR is the scoreboard only after the renewal job is obvious to the client.',
  'Every package needs one owner, one route, one proof screen, one renewal reason, and one upsell path.',
]
