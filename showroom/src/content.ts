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
  { label: 'Daily Tasks', to: '/daily-tasks' },
] as const

export const hero = {
  eyebrow: 'SuperMega',
  title: 'Find companies. Keep the right ones. Run daily tasks.',
  description: 'Simple tools for sales follow-up and daily operations.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Find Companies',
    value: 'Search real businesses',
    detail: 'Search public businesses and keep only the ones worth contacting.',
  },
  {
    label: 'Saved Companies',
    value: 'Keep one clean list',
    detail: 'Paste companies, notes, and stages into one saved list.',
  },
  {
    label: 'Daily Tasks',
    value: 'One short daily list',
    detail: 'Turn messy team notes and blockers into one daily task list.',
  },
]

export const coreProduct = {
  name: 'Saved Companies + Daily Tasks',
  tagline: 'One saved company list and one short task list for the next step.',
  replaces: ['Scattered notes', 'Missed follow-up', 'Manual chasing'],
  inputs: ['Saved companies', 'Team updates', 'Receiving issues'],
  outputs: ['Task list', 'Owner list', 'Next steps'],
  rollout: ['Search or import the right data.', 'Keep it in one list.', 'Run the task list every day.'],
}

export const leadFinder = {
  title: 'Find Companies',
  description: 'Search by place or niche, keep the best results, and move them into Saved Companies.',
  steps: ['Search a market', 'Keep the best companies', 'Open Saved Companies'],
}

export const useCases: UseCase[] = [
  {
    name: 'Sales Setup',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save them in Saved Companies, and keep outreach moving.',
    firstRollout: 'Find Companies plus Saved Companies.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Saved companies', 'Follow-up tasks', 'Cleaner outreach'],
  },
  {
    name: 'Operations Setup',
    audience: 'Owner-led teams and ops managers',
    promise: 'Turn scattered updates into one daily task list with owners and due dates.',
    firstRollout: 'Daily Tasks on top of one team update flow.',
    inputs: ['Meeting notes', 'Daily updates', 'Email follow-up'],
    outcomes: ['One task list', 'Fewer misses', 'Faster review'],
  },
  {
    name: 'Receiving',
    audience: 'Stores, procurement, and plant teams',
    promise: 'Log inbound issues once and keep the next step visible.',
    firstRollout: 'Receiving issues inside Daily Tasks.',
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
    outputs: ['Saved companies', 'Outreach draft', 'Saved Companies rows'],
    path: '/find-companies',
  },
  {
    name: 'Saved Companies',
    tagline: 'Keep saved companies, notes, stages, and next actions together.',
    bestFor: 'Anyone running follow-up from saved companies or imported lists.',
    inputs: ['Saved companies', 'Notes', 'Stage updates', 'Follow-up tasks'],
    outputs: ['Pipeline view', 'Today tasks', 'CSV export'],
    path: '/saved-companies',
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
    name: 'Imported company list',
    audience: 'Anyone who already has names, sites, emails, or phones',
    outcome: 'Clean the list, move the right companies forward, and keep next steps visible.',
    path: '/saved-companies?setup=leads',
  },
  {
    name: 'Daily operations',
    audience: 'Ops, receiving, stores, and plant teams',
    outcome: 'Turn messy updates or receiving issues into one short task list.',
    path: '/daily-tasks?setup=updates',
  },
]
