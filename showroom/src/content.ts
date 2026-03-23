export type TrialModule = {
  id: 'lead-to-pilot' | 'supplier-watch' | 'director-command'
  name: string
  promise: string
  testInput: string
}

export type Product = {
  name: string
  availability: 'Live now' | 'Pilot'
  tagline: string
  input: string
  output: string
  fit: string
  exampleId?: TrialModule['id']
}

export type PackageTier = {
  name: 'Starter' | 'Growth' | 'Scale'
  timeline: string
  commercialModel: string
  bestFor: string
  deliverables: string[]
}

export type FlagshipSystem = {
  name: string
  tagline: string
  steps: string[]
  bestFor: string
}

export const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Agents', to: '/products' },
  { label: 'Live Lab', to: '/examples' },
  { label: 'Pricing', to: '/packages' },
  { label: 'Contact', to: '/contact' },
] as const

export const products: Product[] = [
  {
    name: 'Lead-to-Pilot Agent',
    availability: 'Live now',
    tagline: 'Turn messy lead lists into scored outreach-ready prospects.',
    input: 'Directory text, URL, or pasted lead list',
    output: 'Scored leads, contact pack, CSV export',
    fit: 'Sales, outreach, and SuperMega growth.',
    exampleId: 'lead-to-pilot',
  },
  {
    name: 'Supplier Watch Agent',
    availability: 'Live now',
    tagline: 'Read supplier threads and flag delay, payment, and document risk.',
    input: 'Supplier email thread or pasted message',
    output: 'Risk score, tags, owner, due date, next actions',
    fit: 'Procurement and supply chain teams.',
    exampleId: 'supplier-watch',
  },
  {
    name: 'Director Command Agent',
    availability: 'Live now',
    tagline: 'Convert daily noise into one clean director action brief.',
    input: 'Daily ops updates, forwarded notes, management snippets',
    output: 'Top actions, blockers, decisions needed',
    fit: 'Directors, GMs, and founders.',
    exampleId: 'director-command',
  },
  {
    name: 'Quality CAPA Agent',
    availability: 'Pilot',
    tagline: 'Turn one issue into a structured close-out chain.',
    input: 'Incident text, severity, supplier, evidence',
    output: 'Incident record, containment, RCA, CAPA chain',
    fit: 'Quality teams and plant managers.',
  },
  {
    name: 'Cash Control Agent',
    availability: 'Pilot',
    tagline: 'Pull invoices, cash books, and payment emails into one control view.',
    input: 'Invoice sheets, cash books, payment notes',
    output: 'Overdue queue, collections list, follow-up drafts',
    fit: 'Finance and commercial control.',
  },
]

export const packages: PackageTier[] = [
  {
    name: 'Starter',
    timeline: '2-week sprint',
    commercialModel: 'One workflow',
    bestFor: 'Teams that want one agent live fast.',
    deliverables: ['One live agent', 'One operating view', 'Simple handover SOP'],
  },
  {
    name: 'Growth',
    timeline: '4 to 6 weeks',
    commercialModel: 'Connected rollout',
    bestFor: 'Teams connecting multiple workflows into one layer.',
    deliverables: ['Three connected agents', 'Manager command view', 'Weekly operating rhythm'],
  },
  {
    name: 'Scale',
    timeline: 'Program rollout',
    commercialModel: 'Operating system build',
    bestFor: 'Companies building an AI-native alternative to manual ERP work.',
    deliverables: ['SuperMega OS foundation', 'Role dashboards', 'Governance and rollout playbook'],
  },
]

export const flagshipSystem: FlagshipSystem = {
  name: 'SuperMega OS',
  tagline: 'An AI-native operating layer on top of Gmail, Drive, Sheets, and messy real company data.',
  steps: [
    'Pull signals from inboxes, files, and simple team inputs',
    'Turn them into ranked actions, blockers, and approvals',
    'Run managers and directors from one command layer instead of scattered tools',
  ],
  bestFor: 'Companies that are too messy for traditional ERP and too operational for generic chatbots.',
}

export const trialModules: TrialModule[] = [
  {
    id: 'lead-to-pilot',
    name: 'Lead-to-Pilot',
    promise: 'Paste leads in. Get an outreach-ready contact pack out.',
    testInput: 'Lead list or URL',
  },
  {
    id: 'supplier-watch',
    name: 'Supplier Watch',
    promise: 'Paste one supplier thread. Get risk, owner, and next actions.',
    testInput: 'Supplier email or message',
  },
  {
    id: 'director-command',
    name: 'Director Command',
    promise: 'Paste daily updates. Get a director brief with top actions.',
    testInput: 'Daily notes or updates',
  },
]

export const engagementFlow = [
  'Try one live agent',
  'Connect one real workflow',
  'Ship one manager view',
  'Scale into SuperMega OS',
]
