export type SolutionDemoPortal = {
  id: string
  name: string
  label: string
  status: 'Live client' | 'Live product' | 'App proof' | 'Builder' | 'Control plane'
  buyer: string
  promise: string
  modules: string[]
  dataInputs: string[]
  aiActions: string[]
  route: string
  loginHref: string
  external?: boolean
}

export const SUPERMEGA_DEMO_PORTALS: SolutionDemoPortal[] = [
  {
    id: 'ai-workflow-desk',
    name: 'Document Extraction Ledger',
    label: 'Files and workflow desk',
    status: 'App proof',
    buyer: 'Owner, operator, admin, finance, sales, support, or manager with one repeated manual workflow',
    promise: 'Replace one messy source-heavy workflow with a prepared work queue, reviewed steps, approval gates, and proof pack.',
    modules: ['Source Register', 'Prepared Work Queue', 'Reviewed Step Lane', 'Approval Gate', 'Evidence Pack'],
    dataInputs: ['workflow notes', 'source samples', 'screenshots', 'exports', 'approval owner'],
    aiActions: ['map source inputs', 'draft work queue', 'stage reviewed steps', 'prepare approval packet', 'write proof pack'],
    route: '/app/documents',
    loginHref: '/login?next=/app/documents',
  },
  {
    id: 'industrial-plant-os',
    name: 'Factory Operations App',
    label: 'Operations / factory / distribution',
    status: 'App proof',
    buyer: 'CEO, plant manager, quality, maintenance, operations',
    promise: 'Run daily issues, proof, follow-up, and owner review from one simple operating screen.',
    modules: ['Daily Brief', 'Issue Closeout', 'Quality Traceability', 'Supplier Follow-up', 'Owner Review'],
    dataInputs: ['Drive folders', 'Gmail supplier threads', 'ERP/workbook exports', 'daily manager entry'],
    aiActions: ['summarize changes', 'draft 5W1H/CAPA', 'cluster repeat faults', 'prepare supplier follow-up'],
    route: '/app/industrial-os',
    loginHref: '/login?next=/app/industrial-os',
  },
  {
    id: 'restaurant-group-os',
    name: 'Restaurant POS + Inventory',
    label: 'Restaurant / retail / service counter',
    status: 'App proof',
    buyer: 'Owner operator, area manager, store manager, cashier lead, kitchen lead',
    promise: 'Run item setup, orders, payment proof, cash-up review, shift handover, stock/prep, supplier gaps, and owner closeout from one simple store desk.',
    modules: ['Menu and Items', 'Orders and Payment Proof', 'Shift Board', 'Stock and Prep Control', 'Owner Report'],
    dataInputs: ['menu PDFs/photos', 'provider payment links/slips', 'settlement exports', 'cash-up sheets', 'POS exports', 'manager notes'],
    aiActions: ['Extract item list', 'check payment proof', 'flag cash-up gaps', 'summarize shift', 'draft owner daily report'],
    route: '/app/restaurant-os',
    loginHref: '/login?next=/app/restaurant-os',
  },
  {
    id: 'portal-factory',
    name: 'Workspace Setup',
    label: 'Internal delivery setup',
    status: 'Builder',
    buyer: 'SuperMega founder, implementation team, tenant admins',
    promise: 'Convert a client checklist into roles, modules, data sources, permissions, launch gates, and a generated workspace packet.',
    modules: ['Intake Checklist', 'Module Registry', 'Delivery Roles', 'Data Source Map', 'Go-Live QA'],
    dataInputs: ['client survey', 'role map', 'source inventory', 'workflow samples', 'domain plan'],
    aiActions: ['Generate portal manifest', 'choose first wedge', 'draft proof script', 'run module readiness check'],
    route: '/app/portal-factory',
    loginHref: '/login?next=/app/portal-factory',
  },
  {
    id: 'agent-workbench',
    name: 'Build Review Desk',
    label: 'Implementation workbench',
    status: 'Builder',
    buyer: 'Founder, implementation lead, tenant admin, sales operator',
    promise: 'Turn rough client input into a scoped project packet, task board, approval gates, and a reviewed first release.',
    modules: ['Client Packet', 'Delivery Roles', 'Task Board', 'Runtime Lanes', 'Approval Gates'],
    dataInputs: ['client brief', 'source inventory', 'sample files', 'workflow notes', 'approval owner'],
    aiActions: ['shape the project packet', 'assign scoped tasks', 'prepare first screen', 'run QA checklist', 'draft client handoff'],
    route: '/app/agent-workbench',
    loginHref: '/login?next=/app/agent-workbench',
  },
  {
    id: 'cloud-agent-army',
    name: 'Hosted Operations Control',
    label: 'Internal control plane',
    status: 'Control plane',
    buyer: 'Founder, platform admin, implementation lead',
    promise: 'Run the growth and delivery system as cloud-scheduled, queue-backed, approval-gated workcells.',
    modules: ['Cloud Runtime Lanes', 'Workcells', 'Growth Loop', 'Approval Gates', 'Dispatch Board'],
    dataInputs: ['workflow leads', 'source packets', 'approved build packets', 'run logs', 'approval records'],
    aiActions: ['classify opportunities', 'stage tasks', 'prepare build packets', 'verify proof', 'draft handoffs'],
    route: '/app/cloud-agent-army',
    loginHref: '/login?next=/app/cloud-agent-army',
  },
]

export function getSolutionDemoPortal(id: string | null | undefined) {
  return SUPERMEGA_DEMO_PORTALS.find((portal) => portal.id === id) ?? null
}

export function getDefaultSolutionDemoPortal() {
  return SUPERMEGA_DEMO_PORTALS[0]
}
