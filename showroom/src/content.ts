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
  { label: 'Home', to: '/' },
  { label: 'Find Leads', to: '/find-leads' },
  { label: 'Follow-Up List', to: '/follow-up-list?setup=updates&view=queue' },
  { label: 'Book', to: '/book' },
] as const

export const hero = {
  eyebrow: 'Small AI work tools',
  title: 'Find leads. Build the queue. Keep the next step moving.',
  description: 'Lead Finder finds businesses worth contacting. Follow-Up List turns lead lists or messy updates into one usable queue.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Lead Finder',
    value: 'Real business results',
    detail: 'Search public businesses and keep only the ones worth chasing.',
  },
  {
    label: 'Follow-Up List',
    value: 'Bring your own data',
    detail: 'Paste a lead list or messy team updates and turn them into one usable queue.',
  },
  {
    label: 'Queue',
    value: 'One next-step list',
    detail: 'Turn saved leads and messy notes into one clear daily action queue.',
  },
]

export const coreProduct = {
  name: 'Follow-Up List',
  tagline: 'One saved list and one queue for leads, blockers, and the next step.',
  replaces: ['Scattered notes', 'Missed follow-up', 'Manual chasing'],
  inputs: ['Saved leads', 'Ops updates', 'Receiving issues'],
  outputs: ['Action queue', 'Owner list', 'Next steps'],
  rollout: ['Search or import the right data.', 'Keep it in one list.', 'Run the queue every day.'],
}

export const leadFinder = {
  title: 'Lead Finder',
  description: 'Search by place or niche, keep the best results, and move them into Follow-Up List.',
  steps: ['Search a market', 'Save the best leads', 'Open Follow-Up List'],
}

export const useCases: UseCase[] = [
  {
    name: 'Sales Desk',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save them in Follow-Up List, and keep outreach moving.',
    firstRollout: 'Lead Finder plus Follow-Up List.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Saved leads', 'Follow-up queue', 'Cleaner outreach'],
  },
  {
    name: 'Ops Desk',
    audience: 'Owner-led teams and ops managers',
    promise: 'Turn scattered updates into one queue with owners and due dates.',
    firstRollout: 'Follow-Up List on top of one team update flow.',
    inputs: ['Meeting notes', 'Daily updates', 'Email follow-up'],
    outcomes: ['One queue', 'Fewer misses', 'Faster review'],
  },
  {
    name: 'Receiving',
    audience: 'Stores, procurement, and plant teams',
    promise: 'Log inbound issues once and keep the next step visible.',
    firstRollout: 'Receiving issues inside the follow-up queue.',
    inputs: ['Inbound log', 'PO or PI', 'Batch or GRN'],
    outcomes: ['Receiving queue', 'Variance visibility', 'Clear handoff'],
  },
]

export const publicModules: PublicModule[] = [
  {
    name: 'Lead Finder',
    tagline: 'Search a market, save the right leads, and start outreach.',
    bestFor: 'Prospecting, partnerships, and market mapping.',
    inputs: ['Place or niche search', 'Fit keywords', 'Saved notes'],
    outputs: ['Saved leads', 'Outreach draft', 'Follow-Up List rows'],
    path: '/find-leads',
  },
  {
    name: 'Follow-Up List',
    tagline: 'Keep saved leads, notes, stages, and next actions together.',
    bestFor: 'Anyone running follow-up from saved leads or pasted updates.',
    inputs: ['Saved leads', 'Notes', 'Stage updates', 'Team updates'],
    outputs: ['Pipeline view', 'Today queue', 'CSV export'],
    path: '/follow-up-list',
  },
]

export const starterTemplates: StarterTemplate[] = [
  {
    name: 'Sales follow-up',
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
