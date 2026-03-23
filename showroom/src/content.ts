export type Solution = {
  name: string
  summary: string
  outcomes: string[]
}

export type Product = {
  name: string
  tagline: string
  innovation: string
  capabilities: string[]
  fit: string
}

export type PackageTier = {
  name: 'Starter' | 'Growth' | 'Scale'
  timeline: string
  investment: string
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
  id: 'brief' | 'supplier' | 'quality'
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
    name: 'Daily Brief Agent',
    tagline: 'One daily command view for leadership.',
    innovation:
      'Turns daily business signals into one short priority brief with owner and due date.',
    capabilities: [
      'Morning priority brief',
      'Owner + due date tracking',
      'Decision notes with evidence',
    ],
    fit: 'Founders, CEOs, and directors who need fast decisions.',
  },
  {
    name: 'Supplier Risk Agent',
    tagline: 'Catch supplier risk before it hurts operations.',
    innovation:
      'Reads supplier messages and flags payment, delay, and documentation risk.',
    capabilities: [
      'Risk score per supplier message',
      'Delay and customs warning',
      'Procurement follow-up actions',
    ],
    fit: 'Procurement and supply chain teams.',
  },
  {
    name: 'Quality CAPA Agent',
    tagline: 'From one issue to one CAPA chain.',
    innovation:
      'Converts quality incidents into tracked CAPA actions with closure discipline.',
    capabilities: [
      'Incident capture',
      'CAPA action chain',
      'Closure status tracking',
    ],
    fit: 'Quality teams and plant managers.',
  },
  {
    name: 'Cash Control Agent',
    tagline: 'Tighter control on invoice and payment follow-up.',
    innovation:
      'Turns invoices and payment signals into one collections action list.',
    capabilities: [
      'Overdue payment watchlist',
      'Collections follow-up queue',
      'Weekly cash control summary',
    ],
    fit: 'Finance and commercial managers.',
  },
]

export const solutions: Solution[] = [
  {
    name: 'Executive Intelligence Hub',
    summary:
      'One command center for owners and directors: files, inbox, market watch, and priorities in one execution view.',
    outcomes: [
      'Morning and end-of-day leadership brief with priority ranking',
      'Evidence-linked recommendations from source files and email threads',
      'Weekly plan converted into tracked owner actions',
    ],
  },
  {
    name: 'Sales and Operations Copilot',
    summary:
      'Pipeline, shipment, collections, and delivery signals in one workflow so leadership can spot slippage early.',
    outcomes: [
      'Quote-to-order follow-up automation',
      'Shipment and payment exception watchlist',
      'Actionable weekly sales and collections controls',
    ],
  },
  {
    name: 'Procurement and Supplier Intelligence',
    summary:
      'Continuously track supplier communication, documentation drift, delays, and nonconformance risk.',
    outcomes: [
      'Supplier control register with owner and due-date tracking',
      'Quotation and document-change detection',
      'Procurement risk snapshots tied to escalation paths',
    ],
  },
  {
    name: 'AI-Native ERP Foundation',
    summary:
      'Start from your existing files and email, then evolve into a structured, AI-native ERP operating layer.',
    outcomes: [
      'Structured event intake via Google Sheets or forms',
      'Incident, CAPA, supplier, and action registers',
      'Expandable architecture for multi-company rollouts',
    ],
  },
]

export const packages: PackageTier[] = [
  {
    name: 'Starter',
    timeline: '2 weeks',
    investment: 'USD 1,500 - 3,000',
    bestFor: 'Founder-led teams that need one painful workflow fixed immediately.',
    deliverables: [
      'One high-value workflow automated end-to-end in production',
      'Operator dashboard with owner and due-date tracking',
      'Weekly executive brief and handover SOP',
    ],
  },
  {
    name: 'Growth',
    timeline: '4-6 weeks',
    investment: 'USD 4,000 - 9,000',
    bestFor: 'Teams needing cross-functional controls across sales, operations, quality, and suppliers.',
    deliverables: [
      'Three workflow automations with escalation logic',
      'Unified intelligence and operations dashboard',
      'Role-specific playbooks for repeat decisions',
    ],
  },
  {
    name: 'Scale',
    timeline: '8-12 weeks',
    investment: 'USD 10,000+',
    bestFor: 'Companies turning AI into a core operating layer, not one-off tools.',
    deliverables: [
      'AI-native ERP foundation with module-level controls',
      'Role-based copilots and governed agent tasks',
      'Production analytics baseline and rollout blueprint',
    ],
  },
]

export const caseStudies: CaseStudy[] = [
  {
    title: 'Yangon Tyre: Supplier Signal Consolidation',
    baseline:
      'Supplier and internal signals were scattered across personal inboxes and forwarded threads.',
    intervention:
      'Built focused Gmail profiles and quality/supplier filters, then generated structured briefs, ERP change views, and DQMS starter outputs.',
    outcome:
      'Created one management view for supplier risk, quality incidents, and weekly action tracking.',
    proof: 'Live DQMS starter chain now produces incident/CAPA records from real evidence.',
  },
  {
    title: 'Cross-Channel Decision Dashboard',
    baseline:
      'Leadership had fragmented reporting across folders, inboxes, and market links.',
    intervention:
      'Reworked ingestion and synthesis flow into one digest pipeline with structured output artifacts.',
    outcome:
      'Decision-ready dashboard format with repeatable daily and weekly cadence.',
    proof: 'Unified dashboard + brief outputs now generated from one autopilot workflow.',
  },
  {
    title: 'Showroom Recovery and Productization',
    baseline:
      'Public web assets were fragmented across multiple static prototype pages and mixed messaging.',
    intervention:
      'Reframed into one conversion-focused showroom with package-led positioning and stronger CTA routing.',
    outcome:
      'Clear visitor path from interest to package selection, discovery call, and proposal request.',
    proof: 'Dedicated React showroom with route-level IA, CI deploy workflow, and domain health checks.',
  },
]

export const dqmsModules: DqmsModule[] = [
  {
    name: 'quality_incidents register',
    purpose: 'Track incoming quality signals from email and file evidence into one incident queue.',
    outputs: ['Incident ID', 'severity', 'owner', 'target close date'],
  },
  {
    name: 'capa_actions register',
    purpose: 'Create and monitor corrective actions linked to incidents with verification criteria.',
    outputs: ['CAPA ID', 'incident linkage', 'due date', 'status'],
  },
  {
    name: 'supplier_nonconformance register',
    purpose: 'Roll up supplier-level quality exposure to prioritize containment and escalation.',
    outputs: ['Open count', 'triage count', 'latest issue snapshot'],
  },
]

export const engagementFlow = [
  'Open live examples on this site',
  'Book a 30-minute discovery call',
  'Receive scoped implementation proposal within 24 hours',
  'Start 14-day pilot with weekly measurable outputs',
]

export const trialModules: TrialModule[] = [
  {
    id: 'brief',
    name: 'Daily Brief Example',
    promise: 'Generate a short leadership brief from core signals.',
    testInput: 'Set incidents, open actions, and risk level.',
  },
  {
    id: 'supplier',
    name: 'Supplier Risk Example',
    promise: 'Analyze one supplier message and return risk + actions.',
    testInput: 'Paste a supplier message and run analysis.',
  },
  {
    id: 'quality',
    name: 'Quality CAPA Example',
    promise: 'Generate incident and CAPA chain from one issue.',
    testInput: 'Describe a defect and run CAPA generation.',
  },
]
