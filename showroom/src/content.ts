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
  { label: 'Lead Finder', to: '/lead-finder' },
  { label: 'Workspace', to: '/workspace' },
  { label: 'Book', to: '/book' },
] as const

export const bookingUrl = (import.meta.env.VITE_BOOKING_URL ?? '').trim()

export const hero = {
  eyebrow: 'AI-native workflow software',
  title: 'Find leads. Save the right ones. Run the next step.',
  description: 'Lead Finder finds real businesses. Workspace keeps the leads, notes, and queue together.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Search',
    value: 'Real business results',
    detail: 'Google Places first, with public map fallback.',
  },
  {
    label: 'Workspace',
    value: 'Saved leads and queue',
    detail: 'Keep leads, notes, and next actions in one place.',
  },
  {
    label: 'Queue',
    value: 'One place to run work',
    detail: 'Action OS is the queue inside Workspace.',
  },
]

export const coreProduct = {
  name: 'Action OS',
  tagline: 'One simple queue for follow-up, owners, and blockers.',
  replaces: ['Scattered notes', 'Missed follow-up', 'Manual chasing'],
  inputs: ['Saved leads', 'Ops updates', 'Receiving issues'],
  outputs: ['Action queue', 'Owner list', 'Next steps'],
  rollout: [
    'Search and save the right leads.',
    'Keep them in one workspace.',
    'Run the queue every day.',
  ],
}

export const leadFinder = {
  title: 'Lead Finder',
  description: 'Search by place or niche, save the best results, and move them into Workspace.',
  steps: ['Search a market', 'Save the best leads', 'Open Workspace'],
}

export const useCases: UseCase[] = [
  {
    name: 'Outbound',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save them in Workspace, and keep outreach moving.',
    firstRollout: 'Lead Finder plus Workspace.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Saved leads', 'Follow-up queue', 'Cleaner outreach'],
  },
  {
    name: 'Operations',
    audience: 'Owner-led teams and ops managers',
    promise: 'Turn scattered updates into one queue with owners and due dates.',
    firstRollout: 'Action OS on top of one team update flow.',
    inputs: ['Meeting notes', 'Daily updates', 'Email follow-up'],
    outcomes: ['One board', 'Fewer misses', 'Faster review'],
  },
  {
    name: 'Receiving',
    audience: 'Stores, procurement, and plant teams',
    promise: 'Log inbound issues once and keep the next step visible.',
    firstRollout: 'Receiving Control on top of Action OS.',
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
    outputs: ['Saved leads', 'Outreach draft', 'Workspace rows'],
    path: '/lead-finder',
  },
  {
    name: 'Workspace',
    tagline: 'Keep saved leads, notes, stages, and next actions together.',
    bestFor: 'Anyone running follow-up from saved leads.',
    inputs: ['Saved leads', 'Notes', 'Stage updates'],
    outputs: ['Pipeline view', 'Today queue', 'CSV export'],
    path: '/workspace',
  },
  {
    name: 'Action OS',
    tagline: 'Run one clear queue inside the workspace.',
    bestFor: 'Ops follow-up, sales follow-up, and receiving issues.',
    inputs: ['Lead follow-up', 'Ops blocker', 'Receiving issue'],
    outputs: ['Action rows', 'Owner list', 'Done/open queue'],
    path: '/workspace?view=queue',
  },
]
