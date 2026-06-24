export type PublicSolutionId = 'ai-agent-portal' | 'client-workspace' | 'operations-intelligence'

export type PublicSolution = {
  id: PublicSolutionId
  eyebrow: string
  name: string
  plainName: string
  strap: string
  summary: string
  liveRoute: string
  liveLabel: string
  rolloutLabel: string
  requestPackage: string
  status: string
  inputs: string[]
  workflow: string[]
  controls: string[]
  roles: string[]
  outcomes: string[]
  theme: 'cyan' | 'mint' | 'amber'
  demo: {
    title: string
    metric: string
    rows: Array<{ label: string; value: string; state: string }>
  }
}

export const PUBLIC_SOLUTIONS: readonly PublicSolution[] = [
  {
    id: 'ai-agent-portal',
    eyebrow: 'Agents',
    name: 'Agent Desk',
    plainName: 'Agent Desk',
    strap: 'Run AI workers with jobs, approvals, memory, and audit history.',
    summary: 'Give agents a safe place to research, read files, prepare work, and wait for approval.',
    liveRoute: '/products/agent-runtime',
    liveLabel: 'View Agent Desk',
    rolloutLabel: 'Start with agents',
    requestPackage: 'Agent Desk',
    status: 'Product',
    inputs: ['Gmail', 'Drive', 'Browser', 'API'],
    workflow: ['Assign jobs', 'Review outputs', 'Approve actions'],
    controls: ['Run history', 'Review gates', 'Role access'],
    roles: ['Operators', 'Managers', 'Admins'],
    outcomes: ['Less manual work', 'Visible runs', 'Safe automation'],
    theme: 'cyan',
    demo: {
      title: 'Today',
      metric: '18 agent runs',
      rows: [
        { label: 'Read new Drive files', value: '7 sources', state: 'Review' },
        { label: 'Prepare supplier summary', value: '2 drafts', state: 'Ready' },
        { label: 'Update weekly brief', value: '1 brief', state: 'Approved' },
      ],
    },
  },
  {
    id: 'client-workspace',
    eyebrow: 'Portals',
    name: 'Client Portal',
    plainName: 'Client Portal',
    strap: 'One branded place for requests, files, approvals, and delivery status.',
    summary: 'Give each client or department one simple portal instead of email threads and shared folders.',
    liveRoute: '/products/client-portal',
    liveLabel: 'View Client Portal',
    rolloutLabel: 'Start with portal',
    requestPackage: 'Client Portal',
    status: 'Product',
    inputs: ['Email', 'Drive files', 'Forms', 'Users'],
    workflow: ['Open portal', 'Route requests', 'Share status'],
    controls: ['Tenant scope', 'Role access', 'Decision log'],
    roles: ['Clients', 'Delivery teams', 'Leaders'],
    outcomes: ['One place to work', 'Less chasing', 'Cleaner delivery'],
    theme: 'mint',
    demo: {
      title: 'Client room',
      metric: '12 open items',
      rows: [
        { label: 'Contract files', value: 'Synced', state: 'Shared' },
        { label: 'Delivery approval', value: 'Owner review', state: 'Waiting' },
        { label: 'Weekly status', value: 'Auto-drafted', state: 'Ready' },
      ],
    },
  },
  {
    id: 'operations-intelligence',
    eyebrow: 'Memory',
    name: 'Knowledge Engine',
    plainName: 'Knowledge Engine',
    strap: 'Turn files, messages, decisions, and work history into usable company memory.',
    summary: 'Connect messy business data and make it searchable, structured, and useful for people and agents.',
    liveRoute: '/products/knowledge-graph',
    liveLabel: 'View Knowledge Engine',
    rolloutLabel: 'Start with memory',
    requestPackage: 'Knowledge Engine',
    status: 'Product',
    inputs: ['Drive', 'Docs', 'Sheets', 'ERP exports'],
    workflow: ['Ingest records', 'Clean entities', 'Surface next insight'],
    controls: ['Source links', 'Provenance', 'Access rules'],
    roles: ['Leadership', 'Operations', 'Knowledge teams'],
    outcomes: ['Faster answers', 'Cleaner records', 'Agent-ready data'],
    theme: 'amber',
    demo: {
      title: 'Company memory',
      metric: '4,820 records',
      rows: [
        { label: 'Drive documents', value: 'Mapped', state: 'Live' },
        { label: 'Decision history', value: 'Linked', state: 'Clean' },
        { label: 'Entity graph', value: '312 entities', state: 'Ready' },
      ],
    },
  },
] as const

export const PUBLIC_SOLUTION_IDS = ['ai-agent-portal', 'client-workspace', 'operations-intelligence'] as const

export function getPublicSolution(id: PublicSolutionId) {
  return PUBLIC_SOLUTIONS.find((item) => item.id === id) ?? PUBLIC_SOLUTIONS[0]
}
