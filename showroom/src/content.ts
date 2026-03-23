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

export type PackageTier = {
  name: 'Starter' | 'Growth' | 'Scale'
  timeline: string
  commercialModel: string
  bestFor: string
  deliverables: string[]
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
  { label: 'Examples', to: '/examples' },
  { label: 'Pricing', to: '/packages' },
  { label: 'Contact', to: '/contact' },
] as const

export const products: Product[] = [
  {
    name: 'Lead Finder Agent',
    tagline: 'Turn messy business lists into qualified outreach leads.',
    capabilities: ['Extract contacts', 'Score lead quality', 'Export clean CSV'],
    fit: 'Sales, partnerships, and business development teams.',
    exampleId: 'lead-finder',
  },
  {
    name: 'Daily News Brief Agent',
    tagline: 'Generate a short business brief from live source links.',
    capabilities: ['Fetch source pages', 'Tag risk themes', 'Output daily brief'],
    fit: 'Directors, managers, and owners making daily decisions.',
    exampleId: 'news-brief',
  },
  {
    name: 'Action Planner Agent',
    tagline: 'Convert unstructured notes into owner-ready task plans.',
    capabilities: ['Parse action items', 'Assign suggested owner', 'Set urgency and due window'],
    fit: 'Operations, project, and plant management teams.',
    exampleId: 'action-planner',
  },
]

export const packages: PackageTier[] = [
  {
    name: 'Starter',
    timeline: '1 workflow in 14 days',
    commercialModel: 'Fixed scope',
    bestFor: 'Teams that want one working agent live fast.',
    deliverables: ['One production workflow', 'Simple dashboard', 'Team handover SOP'],
  },
  {
    name: 'Growth',
    timeline: '3 workflows in 4-6 weeks',
    commercialModel: 'Phased scope',
    bestFor: 'Teams needing cross-functional automation and reporting.',
    deliverables: ['Three connected agents', 'Role-based dashboards', 'Weekly execution cadence'],
  },
  {
    name: 'Scale',
    timeline: 'Operating system rollout',
    commercialModel: 'Program scope',
    bestFor: 'Companies building an AI-native management layer.',
    deliverables: ['AI-native ERP foundation', 'Multi-team rollout', 'Governance and expansion plan'],
  },
]

export const trialModules: TrialModule[] = [
  {
    id: 'lead-finder',
    name: 'Lead Finder Example',
    promise: 'Paste directory text or URL and get scored leads.',
    testInput: 'Business text or page URL',
  },
  {
    id: 'news-brief',
    name: 'Daily News Brief Example',
    promise: 'Pull headlines from source links and output a short brief.',
    testInput: 'Source URLs or pasted headlines',
  },
  {
    id: 'action-planner',
    name: 'Action Planner Example',
    promise: 'Turn raw notes into a clean action tracker.',
    testInput: 'Messy updates or meeting notes',
  },
]

export const engagementFlow = [
  'Open examples and test with your own input',
  'Pick one product for pilot',
  'Get scoped plan and timeline',
  'Go live with tracked outcomes',
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
