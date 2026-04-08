export type SystemMetric = {
  label: string
  value: string
}

export type DemoCardItem = {
  title: string
  subtitle: string
  meta?: string
  tone?: 'neutral' | 'accent' | 'warn'
}

export type SalesColumn = {
  name: string
  items: DemoCardItem[]
}

export type PortalSection = {
  name: string
  items: DemoCardItem[]
}

export type DemoScenario =
  | {
      id: string
      label: string
      kind: 'sales'
      context: string
      metrics: SystemMetric[]
      columns: SalesColumn[]
    }
  | {
      id: string
      label: string
      kind: 'operations'
      context: string
      metrics: SystemMetric[]
      inbox: DemoCardItem[]
      approvals: DemoCardItem[]
    }
  | {
      id: string
      label: string
      kind: 'brief'
      context: string
      metrics: SystemMetric[]
      priorities: DemoCardItem[]
      watch: DemoCardItem[]
      wins: DemoCardItem[]
    }
  | {
      id: string
      label: string
      kind: 'portal'
      context: string
      metrics: SystemMetric[]
      sections: PortalSection[]
    }

export type SiteSystem = {
  id: string
  slug: string
  name: string
  shortName: string
  category: string
  tagline: string
  audience: string
  summary: string
  replaces: string[]
  dailyUse: string[]
  setup: string[]
  nextBuilds: string[]
  demoCta: string
  freeToolLabel?: string
  freeToolRoute?: string
  scenarios: DemoScenario[]
}

export type FreeTool = {
  name: string
  tagline: string
  route: string
}

export const SITE_SYSTEMS: SiteSystem[] = [
  {
    id: 'sales',
    slug: 'sales-system',
    name: 'Sales System',
    shortName: 'Sales',
    category: 'Revenue',
    tagline: 'Find companies, qualify them, and keep follow-up moving from one queue.',
    audience: 'Distributors, importers, commercial teams, founders',
    summary: 'Use this when sales work is scattered across search, chat, spreadsheets, and memory.',
    replaces: ['manual prospecting', 'spreadsheet follow-up', 'lost callbacks'],
    dailyUse: ['search new companies', 'keep the shortlist', 'assign the next follow-up'],
    setup: ['import the current list', 'keep one live queue', 'turn on daily brief'],
    nextBuilds: ['quote follow-up', 'dealer mapping', 'customer intake'],
    demoCta: 'Open sales demo',
    freeToolLabel: 'Find clients',
    freeToolRoute: '/find-companies',
    scenarios: [
      {
        id: 'distributor',
        label: 'Distributor',
        kind: 'sales',
        context: 'Owner-led importer building a Yangon dealer list.',
        metrics: [
          { label: 'Active leads', value: '18' },
          { label: 'Follow-ups today', value: '7' },
          { label: 'Replied this week', value: '4' },
        ],
        columns: [
          {
            name: 'New',
            items: [
              { title: 'Apex Bearings', subtitle: 'Industrial importer', meta: 'Call after 3 PM', tone: 'neutral' },
              { title: 'Shwe Power Tools', subtitle: 'Wholesale hardware', meta: 'FB page active', tone: 'accent' },
            ],
          },
          {
            name: 'Follow up',
            items: [
              { title: 'Golden Fasteners', subtitle: 'Quote sent yesterday', meta: 'Owner: Min Thu', tone: 'warn' },
              { title: 'MKT Steel Supply', subtitle: 'Need buyer contact', meta: 'Owner: Swan', tone: 'neutral' },
            ],
          },
          {
            name: 'Reply',
            items: [
              { title: 'Kabar Trading', subtitle: 'Asked for product sheet', meta: 'Draft reply ready', tone: 'accent' },
            ],
          },
        ],
      },
      {
        id: 'service',
        label: 'Service',
        kind: 'sales',
        context: 'B2B service operator following up on inbound referrals.',
        metrics: [
          { label: 'Open conversations', value: '9' },
          { label: 'Next actions', value: '5' },
          { label: 'Won this month', value: '2' },
        ],
        columns: [
          {
            name: 'New',
            items: [
              { title: 'Lotus Logistics', subtitle: 'Referred by supplier', meta: 'Need intro message', tone: 'accent' },
              { title: 'North Wharf', subtitle: 'Operations manager lead', meta: 'Seen on Viber', tone: 'neutral' },
            ],
          },
          {
            name: 'Follow up',
            items: [
              { title: 'Prime Maritime', subtitle: 'Proposal requested', meta: 'Follow up Friday', tone: 'warn' },
            ],
          },
          {
            name: 'Reply',
            items: [
              { title: 'Eastline Transport', subtitle: 'Asked about pricing', meta: 'Reply draft ready', tone: 'accent' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'operations',
    slug: 'operations-inbox',
    name: 'Operations Inbox',
    shortName: 'Operations',
    category: 'Operations',
    tagline: 'Capture orders, issues, approvals, and updates in one working queue.',
    audience: 'Warehouses, restaurants, procurement teams, service operators',
    summary: 'Use this when the team is still running work from Viber, WhatsApp, paper notes, and inbox threads.',
    replaces: ['chat-based operations', 'paper logs', 'missing ownership'],
    dailyUse: ['capture inbound work', 'assign an owner', 'clear blockers fast'],
    setup: ['pick one workflow', 'define statuses', 'review one queue each day'],
    nextBuilds: ['receiving', 'approvals', 'dispatch', 'QR ordering'],
    demoCta: 'Open operations demo',
    freeToolLabel: 'Sort updates',
    freeToolRoute: '/sort-updates',
    scenarios: [
      {
        id: 'restaurant',
        label: 'Restaurant',
        kind: 'operations',
        context: 'QR and chat orders collected into one service queue.',
        metrics: [
          { label: 'Open orders', value: '14' },
          { label: 'Late tickets', value: '2' },
          { label: 'Need approval', value: '1' },
        ],
        inbox: [
          { title: 'Table 04', subtitle: '2 mohinga, 1 iced tea', meta: 'In kitchen', tone: 'accent' },
          { title: 'Counter order', subtitle: 'Pickup in 15 min', meta: 'Needs payment check', tone: 'warn' },
          { title: 'Viber order', subtitle: 'Office lunch set', meta: 'Owner: Aye', tone: 'neutral' },
        ],
        approvals: [
          { title: 'Refund request', subtitle: 'One cold noodle set', meta: 'Manager sign-off', tone: 'warn' },
          { title: 'Menu price edit', subtitle: 'Lunch combo', meta: 'Pending owner', tone: 'neutral' },
        ],
      },
      {
        id: 'warehouse',
        label: 'Warehouse',
        kind: 'operations',
        context: 'Receiving issues and supplier follow-up in one inbox.',
        metrics: [
          { label: 'Open issues', value: '6' },
          { label: 'Supplier holds', value: '2' },
          { label: 'Today cleared', value: '5' },
        ],
        inbox: [
          { title: 'PO 2841', subtitle: 'Short by 12 boxes', meta: 'Owner: Ko Min', tone: 'warn' },
          { title: 'PO 2843', subtitle: 'Damaged outer cartons', meta: 'Awaiting photos', tone: 'neutral' },
          { title: 'PO 2848', subtitle: 'GRN mismatch', meta: 'Need approval', tone: 'accent' },
        ],
        approvals: [
          { title: 'Accept partial receive', subtitle: 'PO 2841', meta: 'Buyer sign-off', tone: 'warn' },
          { title: 'Supplier chargeback', subtitle: 'PO 2843', meta: 'Finance review', tone: 'neutral' },
        ],
      },
    ],
  },
  {
    id: 'brief',
    slug: 'founder-brief',
    name: 'Founder Brief',
    shortName: 'Brief',
    category: 'Management',
    tagline: 'See what needs attention today without opening ten chats and five spreadsheets.',
    audience: 'Founder, GM, directors, managers',
    summary: 'Use this when leadership still gets updates by asking people one by one.',
    replaces: ['manual status chasing', 'dead dashboards', 'late escalations'],
    dailyUse: ['review top risks', 'approve blocked work', 'see what moved'],
    setup: ['connect queues', 'define thresholds', 'schedule the brief'],
    nextBuilds: ['revenue review', 'release guard', 'incident digest'],
    demoCta: 'Open founder brief demo',
    scenarios: [
      {
        id: 'founder',
        label: 'Founder',
        kind: 'brief',
        context: 'Daily brief for an owner running sales and operations together.',
        metrics: [
          { label: 'Needs review', value: '3' },
          { label: 'Open queues', value: '4' },
          { label: 'Incidents', value: '1' },
        ],
        priorities: [
          { title: '3 supplier holds still open', subtitle: 'Warehouse queue', meta: 'Review before 11:00', tone: 'warn' },
          { title: '7 sales follow-ups due today', subtitle: 'Revenue queue', meta: 'Owner: Sales pod', tone: 'accent' },
        ],
        watch: [
          { title: 'App email delivery blocked', subtitle: 'Resend DNS still pending', meta: 'Agent Ops', tone: 'warn' },
          { title: 'One approval waiting', subtitle: 'Partial receive sign-off', meta: 'Operations', tone: 'neutral' },
        ],
        wins: [
          { title: '4 new companies replied', subtitle: 'This week', meta: 'Revenue', tone: 'accent' },
          { title: '5 receiving issues cleared', subtitle: 'Today', meta: 'Operations', tone: 'neutral' },
        ],
      },
      {
        id: 'gm',
        label: 'GM',
        kind: 'brief',
        context: 'GM view across teams with one short morning review.',
        metrics: [
          { label: 'Priority items', value: '5' },
          { label: 'Approvals due', value: '2' },
          { label: 'Queues healthy', value: '3/4' },
        ],
        priorities: [
          { title: 'Restaurant order queue is backing up', subtitle: 'Counter + kitchen', meta: 'Need extra shift lead', tone: 'warn' },
          { title: 'Client portal rollout ready for review', subtitle: 'Delivery pod', meta: 'Approve today', tone: 'accent' },
        ],
        watch: [
          { title: 'Dispatch update missing', subtitle: 'North route', meta: 'Ops follow-up', tone: 'neutral' },
          { title: 'One deal stalled 8 days', subtitle: 'Sales system', meta: 'Founder nudge', tone: 'warn' },
        ],
        wins: [
          { title: 'Customer approval turnaround down to 2h', subtitle: 'Portal queue', meta: 'Service team', tone: 'accent' },
        ],
      },
    ],
  },
  {
    id: 'portal',
    slug: 'client-portal',
    name: 'Client Portal',
    shortName: 'Portal',
    category: 'Client-facing',
    tagline: 'Give customers one place for status, files, approvals, and the next step.',
    audience: 'Agencies, service teams, project teams, B2B operators',
    summary: 'Use this when status updates, files, and approvals still live in email threads and chat messages.',
    replaces: ['email chasing', 'scattered files', 'manual status updates'],
    dailyUse: ['share status', 'collect approvals', 'keep client requests visible'],
    setup: ['define the client view', 'connect the task queue', 'invite the working team'],
    nextBuilds: ['billing status', 'ticketing', 'learning hub'],
    demoCta: 'Open portal demo',
    scenarios: [
      {
        id: 'agency',
        label: 'Agency',
        kind: 'portal',
        context: 'A delivery portal for campaign, design, or implementation work.',
        metrics: [
          { label: 'Open deliverables', value: '8' },
          { label: 'Waiting on client', value: '2' },
          { label: 'Files this week', value: '11' },
        ],
        sections: [
          {
            name: 'Status',
            items: [
              { title: 'Homepage wireframe', subtitle: 'Ready for review', meta: 'Due today', tone: 'accent' },
              { title: 'Launch checklist', subtitle: '2 blockers left', meta: 'Owner: Delivery', tone: 'warn' },
            ],
          },
          {
            name: 'Approvals',
            items: [
              { title: 'Approve new banner set', subtitle: 'Client sign-off required', meta: '1 pending', tone: 'neutral' },
            ],
          },
          {
            name: 'Files',
            items: [
              { title: 'brand-assets-v3.zip', subtitle: 'Uploaded 08:30', meta: 'Design team', tone: 'neutral' },
            ],
          },
        ],
      },
      {
        id: 'training',
        label: 'Training',
        kind: 'portal',
        context: 'A learning or onboarding portal with tasks and checkpoints.',
        metrics: [
          { label: 'Modules live', value: '6' },
          { label: 'Completions', value: '24' },
          { label: 'Needs review', value: '3' },
        ],
        sections: [
          {
            name: 'Modules',
            items: [
              { title: 'Receiving SOP', subtitle: '92% complete', meta: 'Warehouse team', tone: 'accent' },
              { title: 'Escalation path', subtitle: 'Needs revision', meta: 'Ops lead', tone: 'warn' },
            ],
          },
          {
            name: 'Reviews',
            items: [
              { title: 'Quiz review', subtitle: '3 failed attempts', meta: 'Manager check', tone: 'neutral' },
            ],
          },
          {
            name: 'Resources',
            items: [
              { title: 'Packing SOP.pdf', subtitle: 'Latest version', meta: 'Shared with team', tone: 'neutral' },
            ],
          },
        ],
      },
    ],
  },
]

export const FREE_TOOLS: FreeTool[] = [
  { name: 'Find clients', tagline: 'Search for new companies and keep a shortlist.', route: '/find-companies' },
  { name: 'Fix my list', tagline: 'Paste a messy list and turn it into a usable working list.', route: '/company-list' },
  { name: 'Sort updates', tagline: 'Paste messy updates and turn them into clear next actions.', route: '/sort-updates' },
]

export const CUSTOM_BUILD_EXAMPLES = ['QR ordering menu', 'commerce back office', 'approval flow', 'learning portal', 'supplier portal', 'field service board']

export function getSiteSystem(systemIdOrSlug: string | null | undefined) {
  const normalized = String(systemIdOrSlug || '')
    .trim()
    .toLowerCase()
  return SITE_SYSTEMS.find((item) => item.id === normalized || item.slug === normalized || item.name.toLowerCase() === normalized) ?? null
}
