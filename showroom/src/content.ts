import { CORE_SOLUTIONS } from './lib/salesControl'

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

export type TemplatePack = {
  name: string
  category: string
  audience: string
  promise: string
  inputs: string[]
  outputs: string[]
  route: string
  live: boolean
}

export type OperatorAddOn = {
  name: string
  detail: string
}

export const bookingUrl = (import.meta.env.VITE_BOOKING_URL ?? '').trim()

export const navItems = [
  { label: 'What we build', to: '/systems' },
  { label: 'Starter packs', to: '/templates' },
] as const

export const hero = {
  eyebrow: 'SuperMega',
  title: 'Custom AI systems for real company work.',
  description: 'We build simple systems for sales, operations, management, and client-facing work. The goal is less software mess and clearer daily execution.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Find clients',
    value: 'Better than plain search',
    detail: 'Keep only the businesses worth contacting, with fit reasons and first outreach ready.',
  },
  {
    label: 'Clean my list',
    value: 'Use the names you already have',
    detail: 'Paste rows from Google, Facebook, WhatsApp, Excel, or CRM and turn them into one usable sales list.',
  },
]

export const coreProduct = {
  name: 'Starter packs + custom systems',
  tagline: 'Start from one reusable pack, then extend only where the business needs it.',
  replaces: ['Disconnected SaaS', 'Spreadsheet operations', 'Manual chasing'],
  inputs: ['Existing team data', 'Real workflows', 'Current blockers'],
  outputs: ['Working queue', 'Agent loops', 'Role-based control'],
  rollout: ['Pick one workflow.', 'Ship the first working pack.', 'Extend only after the team trusts it.'],
}

export const leadFinder = {
  title: 'Find clients',
  description: 'Search by place or niche, keep the best results, and move them into a usable follow-up list with first outreach ready.',
  steps: ['Search a market', 'Keep the right companies', 'Open Clean my list'],
}

export const useCases: UseCase[] = [
  {
    name: 'Distributor Sales Desk',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save them in Clean my list, and keep outreach moving.',
    firstRollout: 'Find clients plus Clean my list.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Company list', 'Follow-up tasks', 'Cleaner outreach'],
  },
  {
    name: 'List Cleanup Desk',
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
    outputs: ['Shortlist', 'Outreach draft', 'Clean my list rows'],
    path: '/find-companies',
  },
  {
    name: 'Clean my list',
    tagline: 'Paste your existing names and turn them into one usable follow-up list.',
    bestFor: 'Anyone already working from Google, Facebook, WhatsApp, Excel, or CRM exports.',
    inputs: ['Company rows', 'Notes', 'Contact clues', 'Follow-up tasks'],
    outputs: ['Clean list', 'Next steps', 'CSV export'],
    path: '/company-list',
  },
]

export const templatePacks: TemplatePack[] = [
  {
    name: 'Distributor Sales Desk',
    category: 'Sales',
    audience: 'Owner-led distributors, importers, and sales teams',
    promise: 'Find companies, clean messy lists, draft first outreach, and run one daily sales queue.',
    inputs: ['Search results', 'Existing lead list', 'Email and WhatsApp notes'],
    outputs: ['Qualified shortlist', 'Clean company list', 'Follow-up queue'],
    route: '/contact',
    live: true,
  },
  {
    name: 'Founder Daily Brief',
    category: 'Management',
    audience: 'Owners, GMs, and directors',
    promise: 'See one short daily review built from live queues, approvals, and exceptions.',
    inputs: ['Queues', 'Approvals', 'Exception logs', 'Sales state'],
    outputs: ['Daily brief', 'Priority list', 'Leadership review'],
    route: '/contact',
    live: true,
  },
  {
    name: 'Receiving Control',
    category: 'Operations',
    audience: 'Plant, procurement, and receiving teams',
    promise: 'Log inbound issues once, assign owners, and keep one short receiving queue.',
    inputs: ['Receiving notes', 'GRN gaps', 'Hold reports', 'Supplier issues'],
    outputs: ['Issue log', 'Owner queue', 'Daily review'],
    route: '/contact',
    live: true,
  },
  {
    name: 'Approval Flow',
    category: 'Management',
    audience: 'Teams routing quotes, purchases, and internal approvals',
    promise: 'Move approvals through one controlled queue with visible status and decision history.',
    inputs: ['Requests', 'Quotes', 'Documents', 'Decision notes'],
    outputs: ['Approval queue', 'Decision trail', 'Escalation view'],
    route: '/contact',
    live: true,
  },
  {
    name: 'Client Portal',
    category: 'Client-facing',
    audience: 'Service firms, agencies, and B2B operators',
    promise: 'Give clients one place for status, files, approvals, and follow-up instead of endless chats.',
    inputs: ['Project status', 'Files', 'Approvals', 'Messages'],
    outputs: ['Client portal', 'Status view', 'Approval flow'],
    route: '/contact',
    live: false,
  },
  {
    name: 'Learning Hub',
    category: 'Training',
    audience: 'Teams rolling out onboarding, SOPs, and internal training',
    promise: 'Turn onboarding and SOP material into one guided learning system with AI support.',
    inputs: ['Docs', 'SOPs', 'Training notes', 'Videos'],
    outputs: ['Learning path', 'Knowledge prompts', 'Completion view'],
    route: '/contact',
    live: false,
  },
  {
    name: 'Document Intake',
    category: 'Operations',
    audience: 'Teams receiving PDFs, forms, and mixed paperwork every day',
    promise: 'Turn files into extracted actions, fields, and next-step tasks instead of manual retyping.',
    inputs: ['PDFs', 'Forms', 'Emails', 'Scans'],
    outputs: ['Structured fields', 'Task queue', 'Review exceptions'],
    route: '/contact',
    live: false,
  },
  {
    name: 'Commerce Desk',
    category: 'Commerce',
    audience: 'Stores and ecommerce operators',
    promise: 'Run orders, support, stock follow-up, and issue handling from one operating layer.',
    inputs: ['Orders', 'Customer messages', 'Stock notes', 'Support backlog'],
    outputs: ['Ops queue', 'Support flow', 'Stock follow-up'],
    route: '/contact',
    live: false,
  },
]

export const operatorAddOns: OperatorAddOn[] = [
  {
    name: 'Reply Draft',
    detail: 'Draft repetitive supplier and customer replies with the right context attached.',
  },
  {
    name: 'Document Intake',
    detail: 'Extract fields and actions from uploaded files instead of retyping them manually.',
  },
  {
    name: 'Founder Daily Brief',
    detail: 'Summarize the company state automatically from live queues and exceptions.',
  },
  {
    name: 'Browser Sidecar',
    detail: 'Handle narrow browser tasks when there is no API, without making browser automation the core runtime.',
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
]

export const clientTemplates: ClientTemplate[] = [
  ...CORE_SOLUTIONS.map((solution) => ({
    name: solution.name,
    audience: solution.buyer,
    outcome: solution.promise,
    path: '/systems',
  })),
  {
    name: 'Founder Daily Brief',
    audience: 'Owners and senior managers',
    outcome: 'Get one short daily review built from live queues, issues, and priorities.',
    path: '/systems',
  },
]

export const systemOffers: SystemOffer[] = [
  ...CORE_SOLUTIONS.map((solution) => ({
    name: solution.name,
    audience: solution.buyer,
    replaces: solution.replaces,
    outcome: solution.promise,
  })),
  {
    name: 'Founder Daily Brief',
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
