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
  { label: 'Modules', to: '/products' },
  { label: 'Free demos', to: '/demos' },
] as const

export const hero = {
  eyebrow: 'SuperMega',
  title: 'AI software for running company work.',
  description: 'Start with one clear module: Sales OS, Operations OS, Founder Brief, Client Portal, Approval Flow, or Commerce Back Office.',
}

export const proofPoints: ProofPoint[] = [
  {
    label: 'Clear modules',
    value: 'Less sprawl',
    detail: 'Sales, operations, approvals, client updates, and founder review move out of chat threads and into one clear module.',
  },
  {
    label: 'Daily use',
    value: 'Built to run work',
    detail: 'Each module is meant to be opened every day by the team that owns that queue or review.',
  },
]

export const coreProduct = {
  name: 'Company modules and extensions',
  tagline: 'Start with one module that fixes real daily work, then add the next one when the team is ready.',
  replaces: ['Disconnected tools', 'Spreadsheet operations', 'Manual status chasing'],
  inputs: ['Current tools', 'Real queues and reviews', 'The first workflow to replace'],
  outputs: ['Working module', 'Clear ownership', 'A rollout path for the next module'],
  rollout: ['Pick one module.', 'Ship the first working screen.', 'Add the next module after adoption.'],
}

export const siteShowcases: SiteShowcase[] = [
  {
    name: 'Sales OS',
    eyebrow: 'Sales',
    title: 'Prospecting, follow-up, and handoff in one sales module.',
    summary: 'Give the team one place to run accounts, next actions, replies, and manager review.',
    image: '/site/sales-system-screen.png',
    points: ['Account board with owners and next steps', 'Follow-up and reply lanes', 'Founder or sales review on top'],
    route: '/contact?package=Sales%20OS',
  },
  {
    name: 'Operations OS',
    eyebrow: 'Operations',
    title: 'Orders, issues, approvals, and daily ops in one module.',
    summary: 'Start with one live queue and give the team a clear place to run work, clear blockers, and review late items.',
    image: '/site/ops-inbox-screen.png',
    points: ['One queue for daily operations', 'Approvals and exceptions beside the work', 'Clear owners and escalation rules'],
    route: '/contact?package=Operations%20OS',
  },
  {
    name: 'Founder Brief',
    eyebrow: 'Founder',
    title: 'A short daily brief built from the live modules.',
    summary: 'The founder or GM sees the few items that need attention today, not another dashboard full of dead metrics.',
    image: '/site/founder-brief-screen.png',
    points: ['Priority items surfaced automatically', 'Queues and risks in one brief', 'Built for founders, GMs, and directors'],
    route: '/contact?package=Founder%20Brief',
  },
]

export const siteExamples: SiteExample[] = [
  {
    name: 'Sales OS',
    category: 'Sales',
    detail: 'For teams that need one module for accounts, outreach, follow-up, and handoff.',
    image: '/site/sales-system-screen.png',
    route: '/contact?package=Sales%20OS',
    live: true,
  },
  {
    name: 'Founder Brief',
    category: 'Founder',
    detail: 'For founders and managers who need one short operating brief every day.',
    image: '/site/founder-brief-screen.png',
    route: '/contact?package=Founder%20Brief',
    live: true,
  },
  {
    name: 'Operations OS',
    category: 'Operations',
    detail: 'For teams that need one module for daily ops, issues, approvals, and follow-up.',
    image: '/site/ops-inbox-screen.png',
    route: '/contact?package=Operations%20OS',
    live: true,
  },
  {
    name: 'Approval Flow',
    category: 'Operations',
    detail: 'For quotes, requests, and internal decisions that still move through chat and inboxes.',
    image: '/site/ops-inbox-screen.png',
    route: '/contact?package=Approval%20Flow',
    live: true,
  },
  {
    name: 'Client Portal',
    category: 'Client',
    detail: 'For service teams that need one client-facing module for status, files, approvals, and requests.',
    image: '/site/client-portal-screen.png',
    route: '/contact?package=Client%20Portal',
    live: true,
  },
  {
    name: 'Commerce Back Office',
    category: 'Commerce',
    detail: 'For stores and commerce teams that need orders, support, and stock follow-up in one module.',
    image: '/site/ops-inbox-screen.png',
    route: '/contact?package=Commerce%20Back%20Office',
    live: false,
  },
]

export const workExamples: WorkExample[] = [
  {
    name: 'Sales OS',
    category: 'Sales',
    audience: 'Founders, commercial teams, and coordinators',
    title: 'A sales module that turns scattered prospecting into one daily system.',
    summary: 'Built for teams that still work from email, chat, spreadsheets, and notes but need one real sales operating layer.',
    image: '/site/sales-system-screen.png',
    outcomes: [
      'Turn raw account research into one sales queue with next actions.',
      'Give the team one daily follow-up system instead of scattered chats and sheets.',
      'Give the founder one short view of replies, stalled deals, and blocked work.',
    ],
    disclosure: 'Composite example based on common sales workflows. Not presented as a live client deployment.',
  },
  {
    name: 'Client Portal',
    category: 'Client',
    audience: 'Service firms, project teams, and account managers',
    title: 'A client-facing module for status, files, approvals, and requests.',
    summary: 'Built for teams that need to stop chasing client status across email, chat, screenshots, and ad hoc spreadsheets.',
    image: '/site/client-portal-screen.png',
    outcomes: [
      'Keep status, files, and approvals in one client-facing place.',
      'Surface delayed work and missing owner actions before the client asks.',
      'Replace manual update chasing with one operating view for delivery and management.',
    ],
    disclosure: 'Composite example created to show a realistic rollout pattern. Not a named client case study.',
  },
  {
    name: 'Operations OS',
    category: 'Operations',
    audience: 'Operations teams, warehouse teams, and service leads',
    title: 'An operations module for daily work, issues, approvals, and escalations.',
    summary: 'Built for teams that need one visible queue instead of chat threads, inboxes, and end-of-day reporting.',
    image: '/site/ops-inbox-screen.png',
    outcomes: [
      'Capture new work once and keep owners and statuses visible.',
      'Route approvals and blockers without losing context.',
      'Give operations leadership one live view instead of end-of-day reporting only.',
    ],
    disclosure: 'Composite example inspired by common operations workflows. Not a published client engagement.',
  },
  {
    name: 'Approval Flow',
    category: 'Operations',
    audience: 'Teams routing quotes, purchases, client approvals, and internal decisions',
    title: 'An approval module for requests, decisions, escalation, and sign-off.',
    summary: 'Built for teams that need one place to route approvals with status, context, and decision history attached.',
    image: '/site/ops-inbox-screen.png',
    outcomes: [
      'Move approvals out of chat and into one visible workflow.',
      'Keep the decision trail attached to the request.',
      'Escalate slow approvals before they block sales or operations.',
    ],
    disclosure: 'Composite example based on common approval workflows. Shared as a simulated rollout, not a real customer reference.',
  },
]

export const leadFinder = {
  title: 'Find clients demo',
  description: 'Use the free demo to search by place or niche, keep the best results, and prove the front end of Sales OS.',
  steps: ['Search', 'Keep a few', 'Open list cleanup demo'],
}

export const useCases: UseCase[] = [
  {
    name: 'Sales OS',
    audience: 'Founders, sales leads, and coordinators',
    promise: 'Run accounts, follow-up, replies, and handoff from one sales module.',
    firstRollout: 'Import the current lead sheet and turn on one sales queue.',
    inputs: ['Lead sheet or CRM export', 'Owners', 'Sales stages'],
    outcomes: ['Account queue', 'Next actions', 'Founder or sales review'],
  },
  {
    name: 'Operations OS',
    audience: 'Operations leads, service teams, and warehouse teams',
    promise: 'Run daily work, issues, approvals, and escalations from one queue.',
    firstRollout: 'Pick one live workflow and connect one intake channel.',
    inputs: ['Orders or issue intake', 'Owners', 'Statuses'],
    outcomes: ['Operations queue', 'Approval lane', 'Daily review'],
  },
  {
    name: 'Founder Brief',
    audience: 'Founders, GMs, and directors',
    promise: 'See the few updates that need attention today without chasing status by hand.',
    firstRollout: 'Connect the main operating modules and define escalation rules.',
    inputs: ['Live queues', 'Approvals', 'Risk thresholds'],
    outcomes: ['Daily founder brief', 'Priority list', 'Faster decisions'],
  },
]

export const publicModules: PublicModule[] = [
  {
    name: 'Find clients',
    tagline: 'Free Sales OS demo: search a market, keep the right accounts, and start outreach.',
    bestFor: 'Testing the front end of Sales OS.',
    inputs: ['Place or niche search', 'Fit keywords', 'Saved notes'],
    outputs: ['Shortlist', 'Outreach draft', 'List cleanup rows'],
    path: '/find-companies',
  },
  {
    name: 'Clean a list',
    tagline: 'Free Sales OS demo: turn a rough list into a usable sales queue.',
    bestFor: 'Teams already working from spreadsheets, CRM exports, search results, or notes.',
    inputs: ['Company rows', 'Notes', 'Contact clues', 'Follow-up tasks'],
    outputs: ['Clean list', 'Next steps', 'CSV export'],
    path: '/company-list',
  },
  {
    name: 'Sort updates',
    tagline: 'Free Operations OS demo: turn messy updates into a clean operations queue.',
    bestFor: 'Teams reporting work in chat, notes, and screenshots.',
    inputs: ['Team updates', 'Issue notes', 'Status text'],
    outputs: ['Task list', 'Owners', 'Next steps'],
    path: '/sort-updates',
  },
]

export const templatePacks: TemplatePack[] = [
  {
    name: 'Sales OS',
    category: 'Sales',
    audience: 'Sales teams, founders, and coordinators',
    promise: 'Run accounts, outreach, follow-up, and handoff from one sales module.',
    inputs: ['Lead sheet or CRM export', 'Sales notes', 'Owner map'],
    outputs: ['Sales queue', 'Next actions', 'Founder or sales review'],
    route: '/contact',
    live: true,
  },
  {
    name: 'Founder Brief',
    category: 'Founder',
    audience: 'Founders, GMs, and directors',
    promise: 'See one short daily brief built from live modules, approvals, and exceptions.',
    inputs: ['Live queues', 'Approvals', 'Risk thresholds', 'Sales state'],
    outputs: ['Founder brief', 'Priority list', 'Leadership review'],
    route: '/contact',
    live: true,
  },
  {
    name: 'Operations OS',
    category: 'Operations',
    audience: 'Operations teams, service teams, and managers',
    promise: 'Run daily work, issues, approvals, and escalations from one module.',
    inputs: ['Order or issue intake', 'Approvals', 'Status updates', 'Exceptions'],
    outputs: ['Operations queue', 'Owner queue', 'Daily review'],
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
    category: 'Client',
    audience: 'Service firms, agencies, and B2B operators',
    promise: 'Give clients one place for status, files, approvals, and requests instead of endless chats.',
    inputs: ['Project status', 'Files', 'Approvals', 'Messages'],
    outputs: ['Client portal', 'Status view', 'Approval flow'],
    route: '/contact',
    live: true,
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
    name: 'Commerce Back Office',
    category: 'Commerce',
    audience: 'Stores and ecommerce operators',
    promise: 'Run orders, support, stock follow-up, and issue handling from one commerce module.',
    inputs: ['Orders', 'Customer messages', 'Stock notes', 'Support backlog'],
    outputs: ['Commerce queue', 'Support flow', 'Stock follow-up'],
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
    name: 'Founder Brief',
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
    name: 'Founder Brief',
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
    name: 'Founder Brief',
    audience: 'Founders, GMs, and directors',
    replaces: 'manual end-of-day summaries and status meetings with no signal',
    outcome: 'one short daily brief built from the live modules',
  },
]

export const customBuilds: CustomBuild[] = [
  { name: 'Approval Flow', detail: 'Route requests, sign-off, and escalation through one clear workflow.' },
  { name: 'Commerce Back Office', detail: 'Manage orders, support, stock, and follow-up in one module.' },
  { name: 'QR Ordering', detail: 'Route table, counter, and chat orders into one operations queue.' },
  { name: 'Supplier Portal', detail: 'Give suppliers one place for documents, requests, and approvals.' },
  { name: 'Learning Hub', detail: 'Run internal training, onboarding, and SOP rollout with AI help.' },
]
