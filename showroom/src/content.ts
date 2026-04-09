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

export type SiteShowcase = {
  name: string
  eyebrow: string
  title: string
  summary: string
  image: string
  points: string[]
  route: string
}

export type SiteExample = {
  name: string
  category: string
  detail: string
  image: string
  route: string
  live: boolean
}

export type WorkExample = {
  name: string
  category: string
  audience: string
  title: string
  summary: string
  image: string
  outcomes: string[]
  disclosure: string
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
  { label: 'Products', to: '/products' },
  { label: 'Agents', to: '/agents' },
  { label: 'How It Works', to: '/platform' },
] as const

export const hero = {
  eyebrow: 'SuperMega',
  title: 'Connected software for your team, your clients, and your own workspace.',
  description:
    'Start with a real product like Find Clients, Company List, or Receiving Control. Connect Gmail, Google Drive, Sheets, CSVs, APIs, and your existing workflow on one shared system.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'One connected system',
    value: 'Less tool sprawl',
    detail: 'Sales, operations, approvals, and management move in one shared system instead of chats, sheets, and scattered apps.',
  },
  {
    label: 'Built-in automation',
    value: 'Work keeps moving',
    detail: 'Cleanup, summaries, alerts, and follow-up can run in the background without creating another disconnected tool.',
  },
]

export const coreProduct = {
  name: 'Products plus custom rollout',
  tagline: 'Start with one product, then extend only where the business needs it.',
  replaces: ['Disconnected SaaS', 'Spreadsheet operations', 'Manual chasing'],
  inputs: ['Existing team data', 'Real workflows', 'Current blockers'],
  outputs: ['Working queue', 'Connected automations', 'Role-based control'],
  rollout: ['Pick one workflow.', 'Ship the first working product.', 'Extend only after the team trusts it.'],
}

export const siteShowcases: SiteShowcase[] = [
  {
    name: 'Distributor Sales Desk',
    eyebrow: 'Sales',
    title: 'Prospecting, follow-up, and team handoff in one working system.',
    summary: 'Search the market, clean inbound lists, and keep every next step visible instead of losing context across chat, sheets, and scattered notes.',
    image: '/site/sales-desk.svg',
    points: ['New accounts and existing lists in one queue', 'First follow-up ready without extra admin', 'Manager view of what moved and what stalled'],
    route: '/contact?package=Distributor%20Sales%20Desk',
  },
  {
    name: 'Operations Desk',
    eyebrow: 'Operations',
    title: 'Approvals, receiving, exceptions, and daily execution without a heavy ERP rollout.',
    summary: 'Start from one operational bottleneck, turn it into one controlled queue, and let the team run the day from a shared operating layer.',
    image: '/site/ops-desk.svg',
    points: ['One queue for approvals and blockers', 'Receipts, exceptions, and owners in view', 'Daily review instead of ad hoc chasing'],
    route: '/contact?package=Receiving%20Control',
  },
  {
    name: 'Founder Daily Brief',
    eyebrow: 'Management',
    title: 'A short executive view built from the real work layer.',
    summary: 'The founder or GM gets the few items that need attention today, not another dashboard full of dead metrics.',
    image: '/site/founder-brief.svg',
    points: ['Priority changes surfaced automatically', 'Queues and risk pulled into one brief', 'Built for owners, managers, and directors'],
    route: '/contact?package=Founder%20Daily%20Brief',
  },
]

export const siteExamples: SiteExample[] = [
  {
    name: 'Distributor Sales Desk',
    category: 'Sales',
    detail: 'For teams that need one system for prospecting, list cleanup, outreach, and follow-up.',
    image: '/site/sales-desk.svg',
    route: '/contact?package=Distributor%20Sales%20Desk',
    live: true,
  },
  {
    name: 'Founder Daily Brief',
    category: 'Management',
    detail: 'For owners and managers who need one short operating view every day.',
    image: '/site/founder-brief.svg',
    route: '/contact?package=Founder%20Daily%20Brief',
    live: true,
  },
  {
    name: 'Receiving Control',
    category: 'Operations',
    detail: 'For teams that need clean ownership on receiving problems, holds, and follow-up.',
    image: '/site/ops-desk.svg',
    route: '/contact?package=Receiving%20Control',
    live: true,
  },
  {
    name: 'Approval Flow',
    category: 'Operations',
    detail: 'For quotes, requests, and decisions that are still trapped in chat and inboxes.',
    image: '/site/ops-desk.svg',
    route: '/contact?package=Approval%20Flow',
    live: true,
  },
  {
    name: 'Client Portal Starter',
    category: 'Client-facing',
    detail: 'For agencies and service teams that need one clean place for status, files, and approvals.',
    image: '/site/client-portal.svg',
    route: '/contact?package=Client%20Portal',
    live: false,
  },
  {
    name: 'Learning Hub Starter',
    category: 'Training',
    detail: 'For onboarding, SOP rollout, and internal training with AI guidance.',
    image: '/site/client-portal.svg',
    route: '/contact?package=Learning%20Hub',
    live: false,
  },
]

export const workExamples: WorkExample[] = [
  {
    name: 'Distributor Sales Desk',
    category: 'Sales',
    audience: 'Owner-led importers, distributors, and commercial teams',
    title: 'A sales system that turns scattered prospecting into one daily queue.',
    summary: 'Built for teams that live in Facebook, Viber, WhatsApp, Gmail, and spreadsheets but still need one real sales operating layer.',
    image: '/site/sales-desk.svg',
    outcomes: [
      'Turn raw company names and messages into one clean sales list with next actions.',
      'Give the team one daily follow-up queue instead of scattered chats and sheets.',
      'Give the owner one short daily brief on leads, replies, and blocked deals.',
    ],
    disclosure: 'Composite example based on common distributor workflows. Not presented as a live client deployment.',
  },
  {
    name: 'Furniture Order Control',
    category: 'Client-facing',
    audience: 'Retail and project sales teams handling quotes, orders, and delivery updates',
    title: 'A client-facing system for quotes, approvals, delivery status, and customer follow-up.',
    summary: 'Built for teams that need to stop chasing order status across chat, screenshots, and ad hoc spreadsheets.',
    image: '/site/client-portal.svg',
    outcomes: [
      'Keep quotes, approvals, and customer follow-up in one controlled queue.',
      'Surface delayed orders and missing owner actions before the customer asks.',
      'Replace manual status chasing with one operating view for sales and management.',
    ],
    disclosure: 'Composite example created to show a realistic rollout pattern. Not a named client case study.',
  },
  {
    name: 'Electronics Receiving Control',
    category: 'Operations',
    audience: 'Warehouse, plant, and procurement teams receiving mixed shipments',
    title: 'A receiving system for GRN gaps, holds, variances, and supplier follow-up.',
    summary: 'Built for teams that need one visible exception queue instead of end-of-day reporting and scattered inbox threads.',
    image: '/site/ops-desk.svg',
    outcomes: [
      'Log inbound issues once and keep every shortage, hold, or mismatch visible.',
      'Assign one owner and one next step for each receiving exception.',
      'Give management a live exception view instead of end-of-day reporting only.',
    ],
    disclosure: 'Composite example inspired by common warehouse and electronics receiving workflows. Not a published client engagement.',
  },
  {
    name: 'Logistics Operations Desk',
    category: 'Management',
    audience: 'Operators, managers, and founders coordinating multiple teams every day',
    title: 'An operations control room for tasks, approvals, exceptions, and daily management review.',
    summary: 'Built for teams that need one place to see what is late, blocked, waiting for approval, or needs escalation today.',
    image: '/site/control-room.svg',
    outcomes: [
      'Turn messy updates and blocker messages into one prioritized operations queue.',
      'Route escalations and approvals without losing context between teams.',
      'Give leadership one short daily view of late tasks, risks, and decisions.',
    ],
    disclosure: 'Composite example based on typical logistics control needs. Shared as a simulated rollout, not a real customer reference.',
  },
]

export const leadFinder = {
  title: 'Find Clients',
  description: 'Search by place or niche, keep the best results, and move them into a usable follow-up list with first outreach ready.',
  steps: ['Search a market', 'Keep the right companies', 'Open Company List'],
}

export const useCases: UseCase[] = [
  {
    name: 'Find Clients',
    audience: 'Founders, operators, and sales teams',
    promise: 'Find businesses, save them in Company List, and keep outreach moving.',
    firstRollout: 'Find Clients plus Company List.',
    inputs: ['Search query', 'Keywords', 'Saved notes'],
    outcomes: ['Company list', 'Follow-up tasks', 'Cleaner outreach'],
  },
  {
    name: 'Company List',
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
    name: 'Find Clients',
    tagline: 'Search a market, keep the right companies, and start outreach.',
    bestFor: 'Prospecting, partnerships, and market mapping.',
    inputs: ['Place or niche search', 'Fit keywords', 'Saved notes'],
    outputs: ['Shortlist', 'Outreach draft', 'Company List rows'],
    path: '/find-companies',
  },
  {
    name: 'Company List',
    tagline: 'Paste your existing names and turn them into one usable follow-up list.',
    bestFor: 'Anyone already working from Google, Facebook, WhatsApp, Excel, or CRM exports.',
    inputs: ['Company rows', 'Notes', 'Contact clues', 'Follow-up tasks'],
    outputs: ['Clean list', 'Next steps', 'CSV export'],
    path: '/company-list',
  },
  {
    name: 'Receiving log',
    tagline: 'Log shortages, holds, GRN gaps, and supplier issues in one queue.',
    bestFor: 'Procurement, warehouse, plant, and receiving teams.',
    inputs: ['Receiving notes', 'GRN gaps', 'PO or PI', 'Owner follow-up'],
    outputs: ['Issue queue', 'Owner assignments', 'Daily review'],
    path: '/receiving-log',
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
    path: '/products',
  })),
  {
    name: 'Founder Daily Brief',
    audience: 'Owners and senior managers',
    outcome: 'Get one short daily review built from live queues, issues, and priorities.',
    path: '/products',
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
