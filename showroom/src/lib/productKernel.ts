export type ProductKernelStatus = 'proof-route' | 'sell-now' | 'build-next'

export type ProductKernel = {
  id: 'Agency Client Operator' | 'Document Extraction Ledger' | 'Factory Operations App' | 'Restaurant POS + Inventory' | 'Back Office Workflow Desk'
  name: string
  role: 'Main offer' | 'Expansion lane'
  status: ProductKernelStatus
  buyer: string
  promise: string
  firstResult: string
  liveRoute: string
  requestPackage: string
  monthlyPath: string
  readiness: number
  includedModules: string[]
  nextModules: string[]
  proofGate: string
}

export const PRODUCT_KERNEL: ProductKernel[] = [
  {
    id: 'Agency Client Operator',
    name: 'Agency Client Operator',
    role: 'Main offer',
    status: 'sell-now',
    buyer: 'Marketing, development, AI, or operations agency that needs more client capacity without hiring more coordinators.',
    promise: 'Client requests, missing assets, approvals, follow-ups, and weekly reports become one approval-gated operator queue.',
    firstResult: 'A client status console with intake, missing-asset asks, draft updates, owner approvals, and weekly report drafts.',
    liveRoute: '/app/cloud-agent-army',
    requestPackage: 'Agency Client Operator',
    monthlyPath: 'Start with one client workflow, prove weekly reporting and follow-up discipline, then expand across the agency roster.',
    readiness: 90,
    includedModules: ['Client intake', 'Asset queue', 'Approval follow-up', 'Weekly report'],
    nextModules: ['Client portal view', 'Slack/Email summary lane', 'Retainer capacity score'],
    proofGate: 'Agents can summarize, draft, classify, and prepare updates; client-facing sends, scope changes, and billing actions stay approval-only.',
  },
  {
    id: 'Document Extraction Ledger',
    name: 'Document Extraction Ledger',
    role: 'Expansion lane',
    status: 'proof-route',
    buyer: 'Any owner or manager whose first pain is messy files, screenshots, exported records, or intake rows.',
    promise: 'Approved sample files become reviewable records with extracted fields, exceptions, and export proof.',
    firstResult: 'A reviewed ledger with source, extracted fields, exception status, reviewer decision, and export readiness.',
    liveRoute: '/app/documents',
    requestPackage: 'Document Extraction Ledger',
    monthlyPath: 'Start with one reviewed document lane, then expand into recurring back-office queues after the export proves useful.',
    readiness: 92,
    includedModules: ['Source register', 'Field extraction', 'Exception review', 'Export pack'],
    nextModules: ['Portal lookup lane', 'Recurring upload monitor', 'Owner brief'],
    proofGate: 'No record writeback, send, or external action until extracted fields, exceptions, and export output are reviewed.',
  },
  {
    id: 'Factory Operations App',
    name: 'Factory Operations App',
    role: 'Expansion lane',
    status: 'sell-now',
    buyer: 'Factory, warehouse, distributor, or plant team managing quality, maintenance, receiving, inventory, and daily control.',
    promise: 'Factory work becomes one calm control screen grounded in WCM, ISO evidence, and manager action.',
    firstResult: 'A plant daily desk for blockers, evidence, CAPA, maintenance risk, receiving holds, and KPI review.',
    liveRoute: '/app/factory-operations',
    requestPackage: 'Factory Operations App',
    monthlyPath: 'Start with one plant lane, then add more modules after daily use and evidence are stable.',
    readiness: 88,
    includedModules: ['WCM board', 'ISO evidence', 'DQMS/CAPA', 'Maintenance', 'Receiving'],
    nextModules: ['ESP32/meter pilot checklist', 'OEE/down-time entry', 'Supplier claim closeout'],
    proofGate: 'Hardware, meters, inventory balance, and production writeback stay staged until safety and owner approval.',
  },
  {
    id: 'Restaurant POS + Inventory',
    name: 'Restaurant POS + Inventory',
    role: 'Expansion lane',
    status: 'proof-route',
    buyer: 'Restaurant, cafe, retail food, service counter, or small branch team that needs daily close discipline.',
    promise: 'Counter operations stay on one screen: menu/items, orders, payment proof, stock, shift, and close.',
    firstResult: 'A branch daily close with payment proof, stock notes, shift handover, and owner report.',
    liveRoute: '/app/restaurant-pos',
    requestPackage: 'Restaurant POS + Inventory',
    monthlyPath: 'Start with one branch close, then add payments, stock, and more branches once the flow is stable.',
    readiness: 84,
    includedModules: ['Menu/items', 'Orders/payments', 'Payment proof', 'Stock notes', 'Daily close'],
    nextModules: ['QR menu handoff', 'Cash-up reconciliation', 'Multi-branch owner report'],
    proofGate: 'Payment claims, QR ordering, loyalty, and accounting export wait for review and reconciliation checks.',
  },
  {
    id: 'Back Office Workflow Desk',
    name: 'Back Office Workflow Desk',
    role: 'Main offer',
    status: 'sell-now',
    buyer: 'Owner-led teams that want inbox, spreadsheet, research, reporting, CRM, support, or ops admin work handled by controlled agent workcells.',
    promise: 'One back-office job becomes a monitored agent queue with source evidence, human approval, weekly proof, and a clear blocked-action boundary.',
    firstResult: 'A live operator board showing source intake, drafted work, review status, blocked actions, and the weekly value ledger.',
    liveRoute: '/app/cloud-agent-army',
    requestPackage: 'AgentOps Toolbox',
    monthlyPath: 'Run one approved back-office queue weekly, then add more queues and read-only connectors after it proves useful.',
    readiness: 86,
    includedModules: ['Agent scope', 'Source intake', 'Approval queue', 'Run ledger'],
    nextModules: ['Cloud workcell queue', 'Stripe checkout handoff', 'Partner rollout kit'],
    proofGate: 'Agents can read, clean, draft, summarize, and prepare actions; sends, writes, payments, credentials, and customer-impacting decisions stay approval-only.',
  },
]

export const PRODUCT_KERNEL_RULES = [
  'Lead with Agency Client Operator when selling to agencies; it is the clearest path to recurring monthly work.',
  'Start with Back Office Workflow Desk for recurring work; use Document Extraction Ledger when the first pain is messy files or intake records.',
  'Every product must show one live route, one first result, one proof gate, and one next module.',
  'Client-facing screens show products and jobs, not agent-builder, workspace-builder, or internal automation jargon.',
  'AgentOps is sold as a back-office workflow desk with controlled queues, not as unmanaged autonomous agents.',
  'Expansion is earned by usage evidence, not by adding more pages.',
] as const

export function productKernelScore() {
  const total = PRODUCT_KERNEL.reduce((sum, product) => sum + product.readiness, 0)
  return Math.round(total / PRODUCT_KERNEL.length)
}
