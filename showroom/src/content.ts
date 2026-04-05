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

export type SystemOffer = {
  name: string
  audience: string
  replaces: string
  outcome: string
}

export type CustomBuild = {
  name: string
  detail: string
}

export const bookingUrl = (import.meta.env.VITE_BOOKING_URL ?? '').trim()

export const navItems = [
  { label: 'What we build', to: '/systems' },
  { label: 'Free tools', to: '/find-companies' },
] as const

export const hero = {
  eyebrow: 'SuperMega',
  title: 'AI-native systems for sales, operations, and management.',
  description: 'We build custom internal software that replaces scattered tools, spreadsheets, and manual follow-up.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Find clients',
    value: 'Better than plain search',
    detail: 'Keep only the businesses worth contacting, with fit reasons and first outreach ready.',
  },
  {
    label: 'Clean a list',
    value: 'Use the names you already have',
    detail: 'Paste rows from Google, Facebook, WhatsApp, Excel, or CRM and turn them into one usable list.',
  },
]

export const coreProduct = {
  name: 'Find clients + clean a list',
  tagline: 'One shortlist for new leads and one clean list for follow-up.',
  replaces: ['Raw search results', 'Messy spreadsheets', 'Missed follow-up'],
  inputs: ['Public search', 'Company lists', 'Notes from sales or WhatsApp'],
  outputs: ['Shortlist', 'Clean company list', 'Next steps'],
  rollout: ['Find a few good targets.', 'Clean the list you already have.', 'Run the short follow-up list every day.'],
}

export const leadFinder = {
  title: 'Find clients',
  description: 'Search by place or niche, keep the best results, and move them into a clean list with first outreach ready.',
  steps: ['Search a market', 'Keep the right companies', 'Open Clean a list'],
}

export const useCases: UseCase[] = [
  {
    name: 'Sales Setup',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save them in Clean a list, and keep outreach moving.',
    firstRollout: 'Find clients plus Clean a list.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Company list', 'Follow-up tasks', 'Cleaner outreach'],
  },
  {
    name: 'Company Cleanup',
    audience: 'Owner-led teams, sales coordinators, and operators',
    promise: 'Bring your own spreadsheet or text file and turn it into a usable company list.',
    firstRollout: 'Clean my list on top of one imported sales list.',
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
    name: 'Find clients',
    tagline: 'Search a market, keep the right companies, and start outreach.',
    bestFor: 'Prospecting, partnerships, and market mapping.',
    inputs: ['Place or niche search', 'Fit keywords', 'Saved notes'],
    outputs: ['Shortlist', 'Outreach draft', 'Clean My List rows'],
    path: '/find-companies',
  },
  {
    name: 'Clean a list',
    tagline: 'Bring your own rows and turn them into one usable company list.',
    bestFor: 'Anyone running follow-up from imported or hand-built company lists.',
    inputs: ['Company rows', 'Notes', 'Stage updates', 'Follow-up tasks'],
    outputs: ['Pipeline view', 'Today tasks', 'CSV export'],
    path: '/company-list',
  },
  {
    name: 'Log receiving',
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
    name: 'Sales Desk',
    audience: 'Founders, sales teams, and partnerships',
    outcome: 'Find companies, clean the list, and run outreach from one working desk.',
    path: '/systems',
  },
  {
    name: 'Operations Desk',
    audience: 'Managers and operators running daily follow-up',
    outcome: 'Turn updates, blockers, and owner gaps into one clear queue.',
    path: '/systems',
  },
  {
    name: 'Director Brief',
    audience: 'Owners and senior managers',
    outcome: 'Get one daily operating brief built from real queues and exceptions.',
    path: '/systems',
  },
]

export const systemOffers: SystemOffer[] = [
  {
    name: 'Sales Desk',
    audience: 'Founders, sales teams, and partnerships',
    replaces: 'raw search, scattered spreadsheets, manual outreach tracking',
    outcome: 'one shortlist, one follow-up list, one daily revenue queue',
  },
  {
    name: 'Operations Desk',
    audience: 'Ops leads, coordinators, and plant managers',
    replaces: 'chat-based chasing, missed updates, generic task boards',
    outcome: 'one owner list, one blocker queue, one visible next step',
  },
  {
    name: 'Director Brief',
    audience: 'Owners, GMs, and directors',
    replaces: 'manual end-of-day summaries and status meetings with no signal',
    outcome: 'one short daily brief built from the real work layer',
  },
]

export const customBuilds: CustomBuild[] = [
  { name: 'Client portal', detail: 'Give customers one clean place for status, files, and approvals.' },
  { name: 'Learning platform', detail: 'Run internal training, onboarding, and SOP rollout with AI help.' },
  { name: 'Ecommerce back office', detail: 'Manage orders, support, stock, and follow-up in one system.' },
  { name: 'Receiving control', detail: 'Track inbound issues, GRN gaps, holds, and document blockers.' },
  { name: 'Approval and document flow', detail: 'Move requests, files, and exceptions through one clear review path.' },
]
