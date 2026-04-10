import { CORE_SOLUTIONS } from './lib/salesControl'

export type ProofPoint = {
  label: string
  value: string
  detail: string
}

export type EnterpriseSignal = {
  name: string
  detail: string
}

export type MetaTool = {
  name: string
  detail: string
}

export type TenantBlueprint = {
  name: string
  domain: string
  summary: string
  modules: string[]
  roles: string[]
  dataSources: string[]
  controls: string[]
  agentTeams: string[]
  outcomes: string[]
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
  { label: 'Enterprise', to: '/platform' },
  { label: 'Contact', to: '/contact' },
] as const

export const hero = {
  eyebrow: 'SUPERMEGA.dev',
  title: 'One working system for sales and operations.',
  description:
    'Start with Find Clients, Company List, or Receiving Control. Then add roles, approvals, audit history, tenant workspaces, and AI agents on the same system.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'One system',
    value: 'Fewer moving parts',
    detail: 'Sales, operations, approvals, and management run in one shared system instead of scattered chats, sheets, and SaaS tabs.',
  },
  {
    label: 'Built-in agents',
    value: 'Work keeps moving',
    detail: 'Cleanup, summaries, alerts, and follow-up can run in the background without creating another disconnected tool.',
  },
]

export const enterpriseSignals: EnterpriseSignal[] = [
  {
    name: 'Role-based access',
    detail: 'Operators, managers, directors, suppliers, and clients get the right view and the right write scope.',
  },
  {
    name: 'Audit history',
    detail: 'Imports, edits, approvals, and agent actions stay attached to the record that changed.',
  },
  {
    name: 'Tenant workspaces',
    detail: 'Each company or site keeps its own users, files, connectors, and workflow state.',
  },
  {
    name: 'Connector health',
    detail: 'Gmail, Drive, Sheets, ERP, CSV, and API sync failures surface in one queue instead of failing silently.',
  },
  {
    name: 'Approval gates',
    detail: 'Agents can prepare work automatically, while higher-risk writes wait for human approval.',
  },
  {
    name: 'Short rollout path',
    detail: 'Start with one queue and one team, then add more modules without rebuilding the stack.',
  },
]

export const metaTools: MetaTool[] = [
  {
    name: 'Platform Admin',
    detail: 'Review tenant roles, connector posture, knowledge layers, and rollout gaps from one control plane.',
  },
  {
    name: 'Runtime Control',
    detail: 'Watch connector freshness, canon health, agent loops, and guardrail issues from one runtime desk.',
  },
  {
    name: 'Product Ops',
    detail: 'Run release trains, research cells, module graduation, and crew accountability from one desk.',
  },
  {
    name: 'Build',
    detail: 'Track product builds, rollout stages, launch readiness, and platform priorities from one workspace.',
  },
  {
    name: 'Solution Architect',
    detail: 'Map a client or internal team into modules, data sources, roles, and rollout order.',
  },
  {
    name: 'Agent Teams',
    detail: 'Assign agent teams by workspace, write scope, schedule, and approval rule.',
  },
  {
    name: 'Decision Journal',
    detail: 'Keep leadership decisions, exceptions, and approval context attached to live work.',
  },
  {
    name: 'Director Dashboard',
    detail: 'Review risks, blocked work, approvals, and cross-team drift in one place.',
  },
]

export const ytfDeployment: TenantBlueprint = {
  name: 'Yangon Tyre',
  domain: 'ytf.supermega.dev',
  summary:
    'A tenant deployment for plant operations, supplier recovery, quality closeout, inventory watch, commercial CRM, and management review. The same base handles Gmail, Drive, ERP exports, markdown notes, and structured human entry without splitting the company across separate tools.',
  modules: ['Receiving Control', 'Plant Action Board', 'Supplier Control', 'Quality Closeout', 'Inventory Pulse', 'Sales CRM', 'Director Command Center'],
  roles: ['Tenant admin', 'Receiving clerk', 'Procurement lead', 'Plant manager', 'Quality manager', 'Finance controller', 'Sales lead', 'Director'],
  dataSources: ['Gmail sales and procurement threads', 'Google Drive folders', 'Sheets trackers', 'ERP, GRN, and stock exports', 'Obsidian or markdown notes', 'Structured human entry screens'],
  controls: ['Tenant-scoped access', 'Role-based queues', 'Approval gates for supplier, quality, and finance writes', 'Audit history on issues, files, and agent actions'],
  agentTeams: ['Intake Router pod', 'Supplier Recovery pod', 'Quality Watch pod', 'Commercial Memory pod', 'Director Brief pod'],
  outcomes: ['One live exception board for Plant A', 'Cleaner supplier follow-up', 'Stronger director review', 'Human data entry aligned with quality and operations'],
}

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
    name: 'Find Clients',
    eyebrow: 'Sales',
    title: 'Search a market and open the next sales conversation faster.',
    summary: 'Search by place or niche, keep the right companies, and move them into a usable follow-up queue instead of starting from raw search pages every day.',
    image: '/site/find-clients-live.png',
    points: ['Search and shortlist in one place', 'Carry the best rows straight into follow-up', 'Keep the next outreach step visible'],
    route: '/contact?package=Find%20Clients',
  },
  {
    name: 'Company List',
    eyebrow: 'Data',
    title: 'Turn copied rows, CSV files, and notes into one trusted company list.',
    summary: 'Import what the team already has, clean the fields, merge duplicates, and keep the next step attached to the right company record.',
    image: '/site/company-list-live.png',
    points: ['Messy rows cleaned into one list', 'Duplicates and gaps surfaced fast', 'Sales and management work from the same list'],
    route: '/contact?package=Company%20List',
  },
  {
    name: 'Receiving Control',
    eyebrow: 'Operations',
    title: 'Log the issue once and keep the next step visible.',
    summary: 'Shortages, holds, GRN gaps, and supplier follow-up stay in one queue instead of disappearing into chat, inboxes, and end-of-day reporting.',
    image: '/site/receiving-control-live.png',
    points: ['One queue for receiving exceptions', 'Clear owner and next step on each issue', 'Daily review for plant, warehouse, or procurement teams'],
    route: '/contact?package=Receiving%20Control',
  },
]

export const siteExamples: SiteExample[] = [
  {
    name: 'Find Clients',
    category: 'Sales',
    detail: 'Search the market, shortlist the right companies, and move straight into follow-up.',
    image: '/site/find-clients-live.png',
    route: '/contact?package=Find%20Clients',
    live: true,
  },
  {
    name: 'Company List',
    category: 'Data',
    detail: 'Clean and structure existing company rows into one trusted list.',
    image: '/site/company-list-live.png',
    route: '/contact?package=Company%20List',
    live: true,
  },
  {
    name: 'Receiving Control',
    category: 'Operations',
    detail: 'Track holds, shortages, and supplier follow-up in one operating queue.',
    image: '/site/receiving-control-live.png',
    route: '/contact?package=Receiving%20Control',
    live: true,
  },
]

export const workExamples: WorkExample[] = [
  {
    name: 'Find Clients',
    category: 'Sales',
    audience: 'Owner-led importers, distributors, and commercial teams',
    title: 'A sales workflow that turns scattered prospecting into one daily queue.',
    summary: 'Built for teams that live in inboxes, spreadsheets, and copied lists but still need one real place to search, shortlist, and follow up.',
    image: '/site/find-clients-live.png',
    outcomes: [
      'Turn raw company names into a shortlist with clear fit signals.',
      'Move saved companies into one working list with the next step attached.',
      'Give the team one daily follow-up queue instead of scattered notes and sheets.',
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
    tagline: 'Search a market, keep the right companies, and start follow-up.',
    bestFor: 'Prospecting, partnerships, and market mapping.',
    inputs: ['Place or niche search', 'Fit keywords', 'Saved notes', 'Contact clues'],
    outputs: ['Shortlist', 'Outreach draft', 'Company List rows', 'Owned next step'],
    path: '/find-companies',
  },
  {
    name: 'Company List',
    tagline: 'Paste your existing names and turn them into one clean working list.',
    bestFor: 'Teams already working from spreadsheets, copied lists, shared docs, or CRM exports.',
    inputs: ['Company rows', 'Notes', 'Contact clues', 'Follow-up tasks'],
    outputs: ['Clean list', 'Next steps', 'Import history', 'CSV export'],
    path: '/company-list',
  },
  {
    name: 'Receiving Control',
    tagline: 'Log shortages, holds, GRN gaps, and supplier issues in one queue.',
    bestFor: 'Procurement, warehouse, plant, and receiving teams.',
    inputs: ['Receiving notes', 'GRN gaps', 'PO or PI', 'Files', 'Owner follow-up'],
    outputs: ['Issue queue', 'Owner assignments', 'Daily review', 'Audit trail'],
    path: '/receiving-log',
  },
]

export const templatePacks: TemplatePack[] = [
  {
    name: 'Find Clients',
    category: 'Sales',
    audience: 'Owner-led distributors, importers, and sales teams',
    promise: 'Search the market, clean imported company rows, draft first outreach, and run one daily sales queue.',
    inputs: ['Search results', 'Existing lead list', 'Email and chat notes'],
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
