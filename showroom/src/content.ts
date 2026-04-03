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
  { label: 'Lead Finder', to: '/lead-finder' },
  { label: 'Start', to: '/workspace' },
  ...(bookingUrl ? [{ label: 'Book', to: '/book' }] : []),
] as const

export const hero = {
  eyebrow: 'AI-native workflow software',
  title: 'Start with leads, updates, or one ops issue.',
  description: 'Use Lead Finder when you need clients. Use Workspace when you already have a list or messy updates and need the next step.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Search',
    value: 'Real business results',
    detail: 'Search public businesses, then keep only the ones worth chasing.',
  },
  {
    label: 'Workspace',
    value: 'Bring your own data',
    detail: 'Paste a lead list, team updates, or ops issues into one usable workspace.',
  },
  {
    label: 'Queue',
    value: 'One next-step list',
    detail: 'Turn saved leads and messy notes into one clear action queue.',
  },
]

export const coreProduct = {
  name: 'Action OS Starter',
  tagline: 'One saved workspace and one queue for leads, blockers, and the next step.',
  replaces: ['Scattered notes', 'Missed follow-up', 'Manual chasing'],
  inputs: ['Saved leads', 'Ops updates', 'Receiving issues'],
  outputs: ['Action queue', 'Owner list', 'Next steps'],
  rollout: ['Search or import the right data.', 'Keep it in one workspace.', 'Run the queue every day.'],
}

export const leadFinder = {
  title: 'Lead Finder',
  description: 'Search by place or niche, keep the best results, and move them into Workspace.',
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
    firstRollout: 'Workspace queue on top of one team update flow.',
    inputs: ['Meeting notes', 'Daily updates', 'Email follow-up'],
    outcomes: ['One queue', 'Fewer misses', 'Faster review'],
  },
  {
    name: 'Receiving',
    audience: 'Stores, procurement, and plant teams',
    promise: 'Log inbound issues once and keep the next step visible.',
    firstRollout: 'Receiving issues inside the workspace queue.',
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
    bestFor: 'Anyone running follow-up from saved leads or pasted updates.',
    inputs: ['Saved leads', 'Notes', 'Stage updates', 'Team updates'],
    outputs: ['Pipeline view', 'Today queue', 'CSV export'],
    path: '/workspace',
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
