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
  title: 'Find leads. Keep them moving.',
  description: 'Lead Finder searches a market. Workspace keeps the shortlist, notes, and next actions in one place.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Lead Finder',
    value: 'Real search',
    detail: 'Google Places first, public map search fallback.',
  },
  {
    label: 'Workspace',
    value: 'Saved pipeline',
    detail: 'Leads, notes, and stages stay on this device or in the live app.',
  },
  {
    label: 'Action OS',
    value: 'One queue',
    detail: 'Follow-up actions and blockers in one simple board.',
  },
]

export const coreProduct = {
  name: 'Action OS',
  tagline: 'One simple queue for follow-up, owners, and blockers.',
  replaces: ['Scattered notes', 'Missed follow-up', 'Manual chasing'],
  inputs: ['Lead shortlist', 'Ops updates', 'Receiving issues'],
  outputs: ['Action queue', 'Owner list', 'Next steps'],
  rollout: [
    'Start with one workspace.',
    'Save the important leads or issues.',
    'Run one queue every day.',
  ],
}

export const leadFinder = {
  title: 'Lead Finder',
  description: 'Search by place or niche, keep the right results, and move them into the workspace.',
  steps: ['Search a market', 'Keep the shortlist', 'Run follow-up'],
}

export const useCases: UseCase[] = [
  {
    name: 'Outbound',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save the shortlist, and keep outreach moving.',
    firstRollout: 'Lead Finder plus Workspace.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Shortlist', 'Follow-up queue', 'Cleaner outreach'],
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
    tagline: 'Search a market, keep the shortlist, and start outreach.',
    bestFor: 'Prospecting, partnerships, and market mapping.',
    inputs: ['Place or niche search', 'Fit keywords', 'Saved notes'],
    outputs: ['Shortlist', 'Outreach draft', 'Workspace rows'],
    path: '/lead-finder',
  },
  {
    name: 'Workspace',
    tagline: 'Keep saved leads, notes, stages, and next actions together.',
    bestFor: 'Anyone running follow-up from a shortlist.',
    inputs: ['Saved leads', 'Notes', 'Stage updates'],
    outputs: ['Pipeline view', 'Today queue', 'CSV export'],
    path: '/workspace',
  },
  {
    name: 'Action OS',
    tagline: 'Run one clear queue with templates instead of a blank board.',
    bestFor: 'Ops follow-up, sales follow-up, and receiving issues.',
    inputs: ['Lead follow-up', 'Ops blocker', 'Receiving issue'],
    outputs: ['Action rows', 'Owner list', 'Done/open queue'],
    path: '/action-os',
  },
]
