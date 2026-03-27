export type ProofPoint = {
  label: string
  value: string
  detail: string
}

export type UseCase = {
  name: string
  audience: string
  promise: string
  firstRollout: string
  inputs: string[]
  outcomes: string[]
}

export type PublicModule = {
  name: string
  tagline: string
  bestFor: string
  inputs: string[]
  outputs: string[]
  path: string
}

export const navItems = [
  { label: 'Product', to: '/platform' },
  { label: 'Use cases', to: '/solutions' },
  { label: 'Lead Finder', to: '/lead-finder' },
] as const

export const bookingUrl = (import.meta.env.VITE_BOOKING_URL ?? '').trim()

export const hero = {
  eyebrow: 'Main product',
  title: 'One operating system for follow-up, risk, and execution.',
  description:
    'SuperMega connects Gmail, Drive, Sheets, and team updates into one live action layer. Start with Action OS. Add deeper modules only where the business actually needs control.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Wedge',
    value: 'Action OS',
    detail: 'The first live board for managers and directors.',
  },
  {
    label: 'Public proof',
    value: 'Lead Finder',
    detail: 'A real top-of-funnel tool that turns search into offers.',
  },
  {
    label: 'Private app',
    value: 'Workspace + Workbench',
    detail: 'The saved app side for actual use, testing, and rollout.',
  },
]

export const coreProduct = {
  name: 'Action OS',
  tagline: 'Turn scattered updates into one board with owners, due dates, and exceptions.',
  replaces: ['Manual chasing', 'Buried inbox follow-up', 'Director reporting scramble'],
  inputs: ['Gmail', 'Drive', 'Sheets', 'Daily updates'],
  outputs: ['Action board', 'Exception queue', 'Director summary'],
  rollout: [
    'Connect one inbox, one sheet, or one daily update source.',
    'Assign owners and due windows on one board.',
    'Add deeper modules only after the first board is trusted.',
  ],
}

export const useCases: UseCase[] = [
  {
    name: 'Operations',
    audience: 'GMs, operations leads, and owner-led teams',
    promise: 'Get one board for follow-up, blockers, and the daily management rhythm.',
    firstRollout: 'Action OS plus one team update source.',
    inputs: ['Daily updates', 'Meeting notes', 'Shared trackers'],
    outcomes: ['Clear ownership', 'Fewer missed follow-ups', 'Faster weekly review'],
  },
  {
    name: 'Procurement',
    audience: 'Procurement leads, stores, and plant managers',
    promise: 'Control supplier risk and inbound receipt before it turns into plant disruption.',
    firstRollout: 'Receiving Control or Supplier Watch on top of Action OS.',
    inputs: ['Supplier emails', 'PO or ETA sheets', 'Receiving logs'],
    outcomes: ['Supplier risk queue', 'Variance control', 'Cleaner inbound follow-up'],
  },
  {
    name: 'Finance',
    audience: 'Finance managers and commercial controllers',
    promise: 'Turn invoices, collections, and payment proof into one control loop.',
    firstRollout: 'Cash Watch on top of Action OS.',
    inputs: ['Invoice register', 'Cash book', 'Reminder emails'],
    outcomes: ['Overdue queue', 'Collections follow-up', 'Cleaner cash visibility'],
  },
]

export const publicModules: PublicModule[] = [
  {
    name: 'Supplier Watch',
    tagline: 'See supplier delay, payment, and customs risk before it hits execution.',
    bestFor: 'Procurement and supply chain teams.',
    inputs: ['Supplier emails', 'ETA sheet', 'Payment status'],
    outputs: ['Risk queue', 'Escalation owner', 'Follow-up actions'],
    path: '/app/actions',
  },
  {
    name: 'Receiving Control',
    tagline: 'Log inbound material once and keep GRN, hold, and variance visible.',
    bestFor: 'Stores, procurement, and plant teams.',
    inputs: ['Receiving log', 'PO or PI', 'GRN or batch'],
    outputs: ['Receiving board', 'Variance queue', 'Next action'],
    path: '/app/receiving',
  },
  {
    name: 'Inventory Pulse',
    tagline: 'Watch stock, available balance, and reorder pressure in one place.',
    bestFor: 'Stores, operations, and finance teams.',
    inputs: ['Stock sheet', 'Receiving records', 'Reorder point'],
    outputs: ['Stock watch', 'Reorder queue', 'Warehouse action list'],
    path: '/app/inventory',
  },
  {
    name: 'Cash Watch',
    tagline: 'Put collections and payment follow-up into one control view.',
    bestFor: 'Finance and commercial control.',
    inputs: ['Invoice register', 'Cash book', 'Reminder emails'],
    outputs: ['Overdue queue', 'Collections list', 'Follow-up drafts'],
    path: '/app/actions',
  },
]
