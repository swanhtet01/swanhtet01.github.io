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
  { label: 'Home', to: '/' },
  { label: 'Action OS', to: '/platform' },
  { label: 'Lead Finder', to: '/lead-finder' },
] as const

export const bookingUrl = (import.meta.env.VITE_BOOKING_URL ?? '').trim()

export const hero = {
  eyebrow: 'AI-native operating software',
  title: 'Run work in one place.',
  description: 'Action OS runs the work. Lead Finder finds the next customer.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Product',
    value: 'Action OS',
    detail: 'One board for owners, due dates, and blockers.',
  },
  {
    label: 'Tool',
    value: 'Lead Finder',
    detail: 'Search, shortlist, and send outreach.',
  },
  {
    label: 'App',
    value: 'Private workspace',
    detail: 'Saved boards, queues, and notes.',
  },
]

export const coreProduct = {
  name: 'Action OS',
  tagline: 'One board for owners, due dates, and blockers.',
  replaces: ['Manual chasing', 'Buried follow-up', 'Last-minute reporting'],
  inputs: ['Gmail', 'Drive', 'Sheets', 'Team updates'],
  outputs: ['Action board', 'Exception queue', 'Summary'],
  rollout: [
    'Connect one inbox, sheet, or update source.',
    'Assign owners and due dates on one board.',
    'Add more only after the first board is trusted.',
  ],
}

export const leadFinder = {
  title: 'Lead Finder',
  description: 'Search a market, keep the right leads, and build the outreach.',
  steps: ['Search', 'Keep', 'Send'],
}

export const useCases: UseCase[] = [
  {
    name: 'Operations',
    audience: 'GMs, operations leads, and owner-led teams',
    promise: "Get one board for follow-up, blockers, and today's priorities.",
    firstRollout: 'Action OS plus one team update source.',
    inputs: ['Daily updates', 'Meeting notes', 'Shared trackers'],
    outcomes: ['Clear ownership', 'Fewer missed follow-ups', 'Faster weekly review'],
  },
  {
    name: 'Procurement',
    audience: 'Procurement leads, stores, and plant managers',
    promise: 'Control supplier risk and inbound receipt before they turn into delays.',
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
