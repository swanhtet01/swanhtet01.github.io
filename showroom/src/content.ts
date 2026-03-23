export type Solution = {
  name: string
  summary: string
  outcomes: string[]
}

export type Product = {
  name: string
  tagline: string
  capabilities: string[]
  fit: string
  exampleId: TrialModule['id']
}

export type PaidModule = {
  name: string
  tagline: string
  outcomes: string[]
  fit: string
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

export type CaseStudy = {
  title: string
  baseline: string
  intervention: string
  outcome: string
  proof: string
}

export type DqmsModule = {
  name: string
  purpose: string
  outputs: string[]
}

export type TrialModule = {
  id: 'lead-finder' | 'news-brief' | 'action-planner'
  name: string
  promise: string
  testInput: string
}

export const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Products', to: '/products' },
  { label: 'Try Tools', to: '/examples' },
  { label: 'Pricing', to: '/packages' },
  { label: 'Contact', to: '/contact' },
] as const

export const products: Product[] = [
  {
    name: 'Lead Finder',
    tagline: 'Find and clean public business leads in minutes.',
    capabilities: ['Scrape URL or pasted list', 'Extract contacts', 'Export scored CSV'],
    fit: 'Sales, partnerships, and growth teams.',
    exampleId: 'lead-finder',
  },
  {
    name: 'Market Brief',
    tagline: 'Turn a few headlines into one clear management brief.',
    capabilities: ['Read source URLs', 'Tag market/ops risk', 'Generate brief + actions'],
    fit: 'Directors, managers, and owner-led teams.',
    exampleId: 'news-brief',
  },
  {
    name: 'Action Board',
    tagline: 'Convert raw updates into owner + due-date actions.',
    capabilities: ['Parse messy notes', 'Assign owner lane', 'Set priority + due window'],
    fit: 'Operations, project, and plant management teams.',
    exampleId: 'action-planner',
  },
]

export const paidModules: PaidModule[] = [
  {
    name: 'Supplier Watch',
    tagline: 'Catch supplier risk before it turns into delay or payment pressure.',
    outcomes: ['ETA and customs follow-up', 'Payment and invoice escalation', 'Supplier action list by owner'],
    fit: 'Procurement and supply chain teams.',
  },
  {
    name: 'Quality CAPA',
    tagline: 'Turn one quality issue into a tracked close-out chain.',
    outcomes: ['Incident register', 'CAPA action chain', 'Closure and verification tracking'],
    fit: 'Quality teams and plant managers.',
  },
  {
    name: 'Action Board Pro',
    tagline: 'Give managers one board with real owners, due dates, and write-back flow.',
    outcomes: ['Role-based action lanes', 'Manager review rhythm', 'Controlled write-back to team sheets'],
    fit: 'Operations leads, directors, and management teams.',
  },
]

export const packages: PackageTier[] = [
  {
    name: 'Starter',
    timeline: 'Pilot sprint',
    commercialModel: 'Focused scope',
    bestFor: 'Teams that want one working agent fast.',
    deliverables: ['One live agent', 'Simple dashboard', 'Pilot SOP'],
  },
  {
    name: 'Growth',
    timeline: 'Team rollout',
    commercialModel: 'Phased scope',
    bestFor: 'Teams connecting multiple functions into one flow.',
    deliverables: ['Three connected agents', 'Role-based views', 'Weekly operating cadence'],
  },
  {
    name: 'Scale',
    timeline: 'Company operating layer',
    commercialModel: 'Program scope',
    bestFor: 'Companies building an AI-native management layer.',
    deliverables: ['AI-native ERP foundation', 'Multi-team rollout', 'Governance playbook'],
  },
]

export const flagshipSystem: FlagshipSystem = {
  name: 'SuperMega OS',
  tagline: 'One action layer across email, files, and team updates.',
  steps: [
    'Collect updates from email, files, and simple team inputs',
    'Turn raw signals into owner and due-date actions',
    'Run managers and directors from one daily command layer',
  ],
  bestFor: 'Owner-led companies replacing manual ERP work without a heavy rollout.',
}

export const trialModules: TrialModule[] = [
  {
    id: 'lead-finder',
    name: 'Lead Finder',
    promise: 'Paste directory text or URL and get scored leads.',
    testInput: 'Business text or page URL',
  },
  {
    id: 'news-brief',
    name: 'Market Brief',
    promise: 'Turn a few headlines into a short market brief.',
    testInput: 'Source URLs or pasted headlines',
  },
  {
    id: 'action-planner',
    name: 'Action Board',
    promise: 'Turn raw notes into a clean action tracker.',
    testInput: 'Messy updates or meeting notes',
  },
]

export const engagementFlow = [
  'Open one free tool',
  'See one useful output',
  'Connect one workflow',
  'Add owner and due-date actions',
  'Run from one action layer',
]

export const solutions: Solution[] = [
  {
    name: 'AI Agent Operating Layer',
    summary: 'Deploy practical agents first, then connect them into one management system.',
    outcomes: ['Faster decisions', 'Clearer ownership', 'Less manual follow-up'],
  },
]

export const caseStudies: CaseStudy[] = [
  {
    title: 'Yangon Tyre Pilot',
    baseline: 'Scattered files and email threads made follow-up slow.',
    intervention: 'Built structured signals and management outputs.',
    outcome: 'Single daily execution view with clearer ownership.',
    proof: 'Live workflow and dashboard artifacts.',
  },
]

export const dqmsModules: DqmsModule[] = [
  {
    name: 'quality_incidents',
    purpose: 'Track quality events in one register.',
    outputs: ['incident_id', 'severity', 'owner', 'status'],
  },
]
