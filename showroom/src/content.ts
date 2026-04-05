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

export type StarterTemplate = {
  name: string
  detail: string
}

export type ClientTemplate = {
  name: string
  audience: string
  outcome: string
  path: string
}

export const bookingUrl = (import.meta.env.VITE_BOOKING_URL ?? '').trim()

export const navItems = [
  { label: 'Find Companies', to: '/find-companies' },
  { label: 'Company List', to: '/company-list' },
  { label: 'Receiving Log', to: '/receiving-log' },
] as const

export const hero = {
  eyebrow: 'SuperMega',
  title: 'Three simple tools for real work.',
  description: 'Search companies, clean a company list, or log receiving issues.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Find Companies',
    value: 'Search real businesses',
    detail: 'Search public businesses and keep only the ones worth contacting.',
  },
  {
    label: 'Company List',
    value: 'Clean the list you already have',
    detail: 'Paste names, sites, emails, and notes into one usable list.',
  },
  {
    label: 'Receiving Log',
    value: 'Keep inbound issues visible',
    detail: 'Turn shortages, holds, and missing docs into one short follow-up list.',
  },
]

export const coreProduct = {
  name: 'Company List + Task List',
  tagline: 'One clean list of companies and one short list of next steps.',
  replaces: ['Scattered notes', 'Missed follow-up', 'Manual chasing'],
  inputs: ['Company lists', 'Team updates', 'Receiving issues'],
  outputs: ['Task list', 'Owner list', 'Next steps'],
  rollout: ['Search or import the right data.', 'Keep it in one list.', 'Run the task list every day.'],
}

export const leadFinder = {
  title: 'Find Companies',
  description: 'Search by place or niche, keep the best results, and move them into Company List.',
  steps: ['Search a market', 'Keep the best companies', 'Open Company List'],
}

export const useCases: UseCase[] = [
  {
    name: 'Sales Setup',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save them in Company List, and keep outreach moving.',
    firstRollout: 'Find Companies plus Company List.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Company list', 'Follow-up tasks', 'Cleaner outreach'],
  },
  {
    name: 'Company Cleanup',
    audience: 'Owner-led teams, sales coordinators, and operators',
    promise: 'Bring your own spreadsheet or text file and turn it into a usable company list.',
    firstRollout: 'Company List on top of one imported sales list.',
    inputs: ['CSV export', 'Scraped company list', 'CRM notes'],
    outcomes: ['One clean company list', 'Tagged rows', 'Next-step tasks'],
  },
  {
    name: 'Receiving Control',
    audience: 'Stores, procurement, and plant teams',
    promise: 'Log inbound issues once and keep the next step visible.',
    firstRollout: 'Receiving Log for one site, store, or plant team.',
    inputs: ['Inbound log', 'PO or PI', 'Batch or GRN'],
    outcomes: ['Receiving task list', 'Variance visibility', 'Clear handoff'],
  },
]

export const publicModules: PublicModule[] = [
  {
    name: 'Find Companies',
    tagline: 'Search a market, save the right companies, and start outreach.',
    bestFor: 'Prospecting, partnerships, and market mapping.',
    inputs: ['Place or niche search', 'Fit keywords', 'Saved notes'],
    outputs: ['Company list', 'Outreach draft', 'Company List rows'],
    path: '/find-companies',
  },
  {
    name: 'Company List',
    tagline: 'Keep companies, notes, stages, and next actions together.',
    bestFor: 'Anyone running follow-up from imported or hand-built company lists.',
    inputs: ['Company rows', 'Notes', 'Stage updates', 'Follow-up tasks'],
    outputs: ['Pipeline view', 'Today tasks', 'CSV export'],
    path: '/company-list',
  },
  {
    name: 'Receiving Log',
    tagline: 'Log incoming issues and keep only the next receiving follow-up.',
    bestFor: 'Receiving, procurement, stores, and plant teams.',
    inputs: ['GRN gaps', 'Quantity variances', 'Damage reports', 'Customs or document blockers'],
    outputs: ['Receiving issue queue', 'Owner list', 'Open follow-ups'],
    path: '/receiving-log',
  },
]

export const starterTemplates: StarterTemplate[] = [
  {
    name: 'Sales task',
    detail: 'First outreach, reply chase, and booking follow-up.',
  },
  {
    name: 'Ops blocker',
    detail: "A simple queue for today's blockers and owners.",
  },
  {
    name: 'Receiving issue',
    detail: 'One next step for GRN, hold, or quantity variance.',
  },
]

export const clientTemplates: ClientTemplate[] = [
  {
    name: 'Sales follow-up',
    audience: 'Founders, sales teams, and partnerships',
    outcome: 'Find companies, keep the shortlist, and run first outreach.',
    path: '/find-companies',
  },
  {
    name: 'Company list cleanup',
    audience: 'Anyone who already has names, sites, emails, or phones',
    outcome: 'Clean the list, move the right companies forward, and keep next steps visible.',
    path: '/company-list?setup=leads',
  },
  {
    name: 'Receiving log',
    audience: 'Ops, receiving, stores, and plant teams',
    outcome: 'Turn inbound issues into one short follow-up list.',
    path: '/receiving-log',
  },
]
