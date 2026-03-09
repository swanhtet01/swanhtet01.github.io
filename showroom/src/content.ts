export type Solution = {
  name: string
  summary: string
  outcomes: string[]
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

export const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Solutions', to: '/solutions' },
  { label: 'Packages', to: '/packages' },
  { label: 'Case Studies', to: '/case-studies' },
  { label: 'DQMS Add-ons', to: '/dqms' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
] as const

export const solutions: Solution[] = [
  {
    name: 'Executive Intelligence Hub',
    summary:
      'Daily decision briefs from your files, inbox, and market sources in one operating dashboard.',
    outcomes: [
      'Morning director brief with critical alerts and opportunities',
      'Grounded evidence links to source files and emails',
      'Weekly priorities translated into execution actions',
    ],
  },
  {
    name: 'Sales and Operations Copilot',
    summary:
      'Pipeline, shipment, and cash collection signals unified to reduce avoidable delays and leakage.',
    outcomes: [
      'Lead and quote follow-up automation',
      'Order and shipment exception watch',
      'Actionable sales and collection summary every week',
    ],
  },
  {
    name: 'Procurement and Supplier Intelligence',
    summary:
      'Supplier communication patterns, nonconformance risks, and pricing signals tracked continuously.',
    outcomes: [
      'Supplier watchlist for KIIC, JUNKY, and key alternates',
      'Contract and quotation change detection',
      'Procurement risk snapshots tied to owner and due date',
    ],
  },
  {
    name: 'Document and Workflow Automation',
    summary:
      'Manual reporting and repetitive document work replaced with agent workflows and governed templates.',
    outcomes: [
      'Proposal, report, and brief generation with quality controls',
      'Task handoffs tracked by owner and SLA',
      'Faster turnaround with clear audit trail',
    ],
  },
]

export const packages: PackageTier[] = [
  {
    name: 'Starter',
    timeline: '2 weeks',
    investment: 'USD 1,500 - 3,000',
    bestFor: 'Founder-led SMBs starting from spreadsheets, email, and shared folders.',
    deliverables: [
      'One high-value workflow automated end-to-end',
      'Lead capture and tracker baseline',
      'Weekly executive summary template and rollout',
    ],
  },
  {
    name: 'Growth',
    timeline: '4-6 weeks',
    investment: 'USD 4,000 - 9,000',
    bestFor: 'Teams that need multi-workflow coordination across sales, operations, and suppliers.',
    deliverables: [
      'Three workflow automations with owner routing',
      'Internal intelligence dashboard and source connectors',
      'Case-specific playbooks for recurring decisions',
    ],
  },
  {
    name: 'Scale',
    timeline: '8-12 weeks',
    investment: 'USD 10,000+',
    bestFor: 'Operators building AI as a strategic operating layer across the company.',
    deliverables: [
      'Full operating cockpit with KPI tiles and alerting',
      'Role-specific agent assistants and governed prompt packs',
      'Delivery SOP, analytics baseline, and team enablement',
    ],
  },
]

export const caseStudies: CaseStudy[] = [
  {
    title: 'Yangon Tyre: Supplier Signal Consolidation',
    baseline:
      'Supplier and internal signals were scattered across personal inboxes and forwarded threads.',
    intervention:
      'Built focused Gmail profiles and quality/supplier filters, then generated structured briefs and DQMS starter outputs.',
    outcome:
      'Created one view for supplier risk, quality incidents, and priority action tracking.',
    proof: '13 incident-to-CAPA starter records generated from real signals in current run.',
  },
  {
    title: 'Cross-Channel Dashboard Build (Web + Data Sources)',
    baseline:
      'Leadership lacked one operational dashboard tying internal metrics with market context.',
    intervention:
      'Reused Manus prototypes and rebuilt a coherent dashboard workflow with exportable summaries.',
    outcome:
      'Decision-ready dashboard format with shared evidence and repeatable weekly cadence.',
    proof: 'Manus archive now indexed with 3,014 classified assets for selective reuse.',
  },
  {
    title: 'Showroom Recovery and Productization',
    baseline:
      'Public web assets were fragmented across multiple static prototype pages and mixed messaging.',
    intervention:
      'Reframed offer stack into a single conversion-focused showroom with package-led positioning.',
    outcome:
      'Clear visitor path from interest to package selection, discovery call, and proposal request.',
    proof: 'Dedicated React showroom with route-level IA and production build workflow.',
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
  'Lead form submission from showroom',
  '30-minute discovery call within 48 hours',
  'Proposal and implementation plan in under 24 hours after discovery',
  'Weekly delivery artifacts with measurable outcomes',
]
