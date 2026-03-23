export type TrialModule = {
  id: 'lead-finder' | 'market-brief' | 'action-board'
  name: string
  promise: string
  testInput: string
}

export type Product = {
  kind: 'Free tool' | 'Control module'
  name: string
  availability: 'Try free' | 'Deploy'
  tagline: string
  input: string
  output: string
  fit: string
  variants: string[]
  exampleId?: TrialModule['id']
}

export type PackageTier = {
  name: 'Starter' | 'Control Pack' | 'OS Build'
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
  { label: 'Products', to: '/products' },
  { label: 'Tools', to: '/examples' },
  { label: 'Plans', to: '/packages' },
  { label: 'Contact', to: '/contact' },
] as const

export const products: Product[] = [
  {
    kind: 'Free tool',
    name: 'Lead Finder',
    availability: 'Try free',
    tagline: 'Turn a messy list into a cleaner lead sheet in minutes.',
    input: 'Directory text, URL, or pasted lead list',
    output: 'Scored leads, contact pack, CSV export',
    fit: 'Sales, partnerships, and outbound teams.',
    variants: ['Distributors', 'Retail stores', 'Industrial buyers'],
    exampleId: 'lead-finder',
  },
  {
    kind: 'Free tool',
    name: 'News Brief',
    availability: 'Try free',
    tagline: 'Convert messy headlines into one short operating brief.',
    input: 'Headlines, copied articles, or pasted notes',
    output: 'Priority summary, risk tags, next actions',
    fit: 'Directors, founders, and market-watch teams.',
    variants: ['News watch', 'Market watch', 'Policy watch'],
    exampleId: 'market-brief',
  },
  {
    kind: 'Free tool',
    name: 'Action Board',
    availability: 'Try free',
    tagline: 'Turn raw updates into owners, priorities, and due windows.',
    input: 'Team updates, forwarded notes, or meeting scraps',
    output: 'Action list, priority lane, owner queue',
    fit: 'Operations, projects, and plant management.',
    variants: ['Daily standup', 'Director review', 'Follow-up tracker'],
    exampleId: 'action-board',
  },
  {
    kind: 'Control module',
    name: 'Supplier Watch',
    availability: 'Deploy',
    tagline: 'Catch delay, payment, and customs risk before it hurts operations.',
    input: 'Supplier emails, ETA sheets, customs notes',
    output: 'Risk score, escalation queue, owner + due date',
    fit: 'Procurement and supply chain teams.',
    variants: ['Import watch', 'Supplier delay watch', 'Documentation watch'],
  },
  {
    kind: 'Control module',
    name: 'Quality Closeout',
    availability: 'Deploy',
    tagline: 'Turn one quality issue into a tracked close-out chain.',
    input: 'Incident text, severity, supplier, evidence',
    output: 'Incident record, containment, RCA, CAPA chain',
    fit: 'Quality teams and plant managers.',
    variants: ['Supplier NC', 'Customer complaint', 'Internal defect'],
  },
  {
    kind: 'Control module',
    name: 'Cash Watch',
    availability: 'Deploy',
    tagline: 'Put invoices, reminders, and collections into one control view.',
    input: 'Invoice sheets, cash books, payment notes',
    output: 'Overdue queue, collections list, follow-up drafts',
    fit: 'Finance and commercial control.',
    variants: ['Collections', 'Invoice control', 'Payment confirmation'],
  },
]

export const packages: PackageTier[] = [
  {
    name: 'Starter',
    timeline: '2-week sprint',
    commercialModel: 'One free tool + one first workflow',
    bestFor: 'Teams that want one useful win without a heavy rollout.',
    deliverables: ['One live tool setup', 'One operator workflow', 'Simple handover SOP'],
  },
  {
    name: 'Control Pack',
    timeline: '4 to 6 weeks',
    commercialModel: 'Two or three connected modules',
    bestFor: 'Teams fixing a function end-to-end.',
    deliverables: ['Supplier, quality, cash, or ops pack', 'Manager control board', 'Weekly operating rhythm'],
  },
  {
    name: 'OS Build',
    timeline: 'Program rollout',
    commercialModel: 'AI-native operating layer',
    bestFor: 'Companies replacing manual ERP work with one action system.',
    deliverables: ['SuperMega OS foundation', 'Role views', 'Governance and rollout playbook'],
  },
]

export const flagshipSystem: FlagshipSystem = {
  name: 'SuperMega OS',
  tagline: 'An AI-native action layer on top of Gmail, Drive, Sheets, and messy company data.',
  steps: [
    'Pull signals from inboxes, files, and simple team inputs',
    'Convert them into owners, due dates, blockers, and approvals',
    'Run managers and directors from one control layer instead of scattered spreadsheets',
  ],
  bestFor: 'Owner-led companies that are too messy for ERP and too operational for generic AI chat.',
}

export const trialModules: TrialModule[] = [
  {
    id: 'lead-finder',
    name: 'Lead Finder',
    promise: 'Paste leads in. Get a cleaner contact pack out.',
    testInput: 'Lead list or URL',
  },
  {
    id: 'market-brief',
    name: 'News Brief',
    promise: 'Paste headlines in. Get one short market brief out.',
    testInput: 'Headlines or notes',
  },
  {
    id: 'action-board',
    name: 'Action Board',
    promise: 'Paste raw updates. Get owners and due dates out.',
    testInput: 'Daily notes or updates',
  },
]

export const engagementFlow = [
  'Try one free tool',
  'Deploy one control module',
  'Ship one manager view',
  'Scale into SuperMega OS',
]
