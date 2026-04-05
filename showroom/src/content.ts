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

export const bookingUrl = (import.meta.env.VITE_BOOKING_URL ?? '').trim()

export const navItems = [
  { label: 'Find Companies', to: '/find-companies' },
  { label: 'Company List', to: '/company-list' },
  { label: 'Task List', to: '/task-list' },
] as const

export const hero = {
  eyebrow: 'SuperMega',
  title: 'Find companies. Keep a list. Run tasks.',
  description: 'Simple tools for sales follow-up and daily operations.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Find Companies',
    value: 'Search real businesses',
    detail: 'Search public businesses and keep only the ones worth contacting.',
  },
  {
    label: 'Company List',
    value: 'Keep one clean list',
    detail: 'Paste companies, notes, and stages into one saved list.',
  },
  {
    label: 'Task List',
    value: 'One short task list',
    detail: 'Turn messy team notes and blockers into one daily task list.',
  },
]

export const coreProduct = {
  name: 'Company List + Task List',
  tagline: 'One saved company list and one short task list for the next step.',
  replaces: ['Scattered notes', 'Missed follow-up', 'Manual chasing'],
  inputs: ['Saved companies', 'Team updates', 'Receiving issues'],
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
    outcomes: ['Saved companies', 'Follow-up tasks', 'Cleaner outreach'],
  },
  {
    name: 'Operations Setup',
    audience: 'Owner-led teams and ops managers',
    promise: 'Turn scattered updates into one task list with owners and due dates.',
    firstRollout: 'Task List on top of one team update flow.',
    inputs: ['Meeting notes', 'Daily updates', 'Email follow-up'],
    outcomes: ['One task list', 'Fewer misses', 'Faster review'],
  },
  {
    name: 'Receiving',
    audience: 'Stores, procurement, and plant teams',
    promise: 'Log inbound issues once and keep the next step visible.',
    firstRollout: 'Receiving issues inside Task List.',
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
    outputs: ['Saved companies', 'Outreach draft', 'Company List rows'],
    path: '/find-companies',
  },
  {
    name: 'Company List',
    tagline: 'Keep saved companies, notes, stages, and next actions together.',
    bestFor: 'Anyone running follow-up from saved companies or imported lists.',
    inputs: ['Saved companies', 'Notes', 'Stage updates', 'Follow-up tasks'],
    outputs: ['Pipeline view', 'Today tasks', 'CSV export'],
    path: '/company-list',
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
