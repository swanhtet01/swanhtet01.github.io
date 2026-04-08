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
  previewImage: string
  previewAlt: string
  previewNote: string
  surface: string[]
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
    name: 'Sales OS',
    shortName: 'Sales',
    category: 'Sales',
    tagline: 'Run prospecting, follow-up, and handoff from one sales workspace.',
    audience: 'Founders, sales leads, coordinators, B2B teams',
    summary: 'One sales module for target accounts, next actions, replies, and manager review.',
    previewImage: '/site/sales-system-screen.png',
    previewAlt: 'Sales OS screenshot showing new accounts, follow-up today, and reply-ready sales lanes.',
    previewNote: 'Current branch screen.',
    surface: [
      'A board for new accounts, follow-ups, and reply-ready deals',
      'Each company has an owner, a next step, and deal context',
      'Managers can spot stalled deals and overdue follow-ups in one pass',
    ],
    replaces: ['manual prospecting', 'spreadsheet follow-up', 'missed next steps'],
    dailyUse: ['research and save target accounts', "assign today's follow-ups and replies", 'review stalled deals before they go cold'],
    setup: ['import the current lead sheet or CRM export', 'map owners, stages, and next actions', 'turn on a founder or sales review'],
    nextBuilds: ['quote follow-up', 'dealer or territory mapping', 'customer intake and handoff'],
    demoCta: 'Open Sales OS demo',
    freeToolLabel: 'Find clients demo',
    freeToolRoute: '/find-companies',
    scenarios: [
      {
        id: 'distributor',
        label: 'Distributor sales',
        kind: 'sales',
        context: "A distributor building a dealer list and tracking today's callbacks in one place.",
        metrics: [
          { label: 'Active leads', value: '18' },
          { label: 'Follow-ups today', value: '7' },
          { label: 'Replied this week', value: '4' },
        ],
        columns: [
          {
            name: 'New accounts',
            items: [
              { title: 'Apex Bearings', subtitle: 'Industrial importer', meta: 'Call after 3 PM', tone: 'neutral' },
              { title: 'Shwe Power Tools', subtitle: 'Wholesale hardware', meta: 'FB page active', tone: 'accent' },
            ],
          },
          {
            name: 'Follow-up today',
            items: [
              { title: 'Golden Fasteners', subtitle: 'Quote sent yesterday', meta: 'Owner: Min Thu', tone: 'warn' },
              { title: 'MKT Steel Supply', subtitle: 'Need buyer contact', meta: 'Owner: Swan', tone: 'neutral' },
            ],
          },
          {
            name: 'Reply ready',
            items: [
              { title: 'Kabar Trading', subtitle: 'Asked for product sheet', meta: 'Draft reply ready', tone: 'accent' },
            ],
          },
        ],
      },
      {
        id: 'service',
        label: 'Service sales',
        kind: 'sales',
        context: 'A B2B service team moving referrals from first contact to booked call.',
        metrics: [
          { label: 'Open conversations', value: '9' },
          { label: 'Next actions', value: '5' },
          { label: 'Won this month', value: '2' },
        ],
        columns: [
          {
            name: 'New accounts',
            items: [
              { title: 'Lotus Logistics', subtitle: 'Referred by supplier', meta: 'Need intro message', tone: 'accent' },
              { title: 'North Wharf', subtitle: 'Operations manager lead', meta: 'Seen on Viber', tone: 'neutral' },
            ],
          },
          {
            name: 'Follow-up today',
            items: [
              { title: 'Prime Maritime', subtitle: 'Proposal requested', meta: 'Follow up Friday', tone: 'warn' },
            ],
          },
          {
            name: 'Reply ready',
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
    name: 'Operations OS',
    shortName: 'Ops',
    category: 'Operations',
    tagline: 'Run orders, issues, approvals, and daily ops from one queue.',
    audience: 'Operations leads, service teams, warehouse teams, shift managers',
    summary: 'One operations module where new work lands, owners are assigned, and exceptions stay visible until cleared.',
    previewImage: '/site/ops-inbox-screen.png',
    previewAlt: 'Operations OS screenshot showing the inbox and approvals side by side.',
    previewNote: 'Current branch screen.',
    surface: [
      'New work enters one inbox instead of chat threads',
      'Approvals and exceptions sit beside the working queue',
      'Late items, blockers, and owners are visible to the shift lead',
    ],
    replaces: ['chat-based operations', 'paper logs', 'missing ownership'],
    dailyUse: ['capture orders, requests, or receiving issues', 'assign an owner and clear the next blocker', 'review late items and approvals once per shift'],
    setup: ['pick one live workflow such as service, warehouse, or store orders', 'define statuses, owners, and escalation timers', 'connect the intake channel and start with one queue'],
    nextBuilds: ['warehouse control', 'approval flow', 'QR ordering', 'commerce back office'],
    demoCta: 'Open Operations OS demo',
    freeToolLabel: 'Sort updates demo',
    freeToolRoute: '/sort-updates',
    scenarios: [
      {
        id: 'restaurant',
        label: 'QR ordering',
        kind: 'operations',
        context: 'A restaurant routing QR, counter, and chat orders through one service inbox.',
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
        label: 'Receiving',
        kind: 'operations',
        context: 'A warehouse logging shortages, holds, and supplier follow-up in one receiving inbox.',
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
    category: 'Founder',
    tagline: 'Get the few company updates that need attention today.',
    audience: 'Founders, GMs, directors, multi-site operators',
    summary: 'A short daily brief built from the live modules, not manual status chasing.',
    previewImage: '/site/founder-brief-screen.png',
    previewAlt: 'Founder Brief screenshot showing priority items, watch items, and wins.',
    previewNote: 'Current branch screen.',
    surface: [
      'Priority items grouped by business function',
      'Approvals, risks, and stalled work surfaced automatically',
      'Movement and wins pulled from the live systems, not manual reporting',
    ],
    replaces: ['manual status chasing', 'stale dashboards', 'late escalations'],
    dailyUse: ['review top risks and overdue items', 'approve blocked work in minutes', 'see where sales or operations need intervention'],
    setup: ['connect Sales OS and Operations OS', 'define thresholds for escalations and stale work', 'schedule the brief for the founder or GM each morning'],
    nextBuilds: ['revenue review', 'incident digest', 'board or investor packet'],
    demoCta: 'Open Founder Brief demo',
    scenarios: [
      {
        id: 'founder',
        label: 'Founder',
        kind: 'brief',
        context: 'A founder checking the company state before sales calls and operations review.',
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
          { title: 'One approval waiting', subtitle: 'Partial receive sign-off', meta: 'Operations', tone: 'warn' },
          { title: 'One deal stalled 6 days', subtitle: 'Needs owner nudge', meta: 'Sales', tone: 'neutral' },
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
        context: 'A GM review across stores, delivery, and sales with only the items that need action today.',
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
    category: 'Client',
    tagline: 'Give clients one place for status, files, approvals, and requests.',
    audience: 'Agencies, service firms, implementation teams, account managers',
    summary: 'One client-facing module that keeps delivery status, files, approvals, and requests visible without email chasing.',
    previewImage: '/site/client-portal-screen.png',
    previewAlt: 'Client Portal screenshot showing status, approvals, and files in one client-facing workspace.',
    previewNote: 'Current branch screen.',
    surface: [
      'Live status by project, order, or account',
      'Approvals and requests with full history',
      'Files, notes, and next actions in the same client view',
    ],
    replaces: ['email chasing', 'scattered files', 'manual status updates'],
    dailyUse: ['share status without manual update emails', 'collect client approvals and requests', 'keep delivery and account teams aligned'],
    setup: ['define the client milestones and views', 'connect the delivery queue, files, and approval steps', 'invite the internal team first, then roll it out to clients'],
    nextBuilds: ['approval flow', 'billing status', 'support desk', 'learning hub'],
    demoCta: 'Open Client Portal demo',
    scenarios: [
      {
        id: 'agency',
        label: 'Agency',
        kind: 'portal',
        context: 'A client portal for campaign, design, or implementation work with visible approvals.',
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
        id: 'orders',
        label: 'Order status',
        kind: 'portal',
        context: 'A client portal for quotes, delivery updates, files, and approval history.',
        metrics: [
          { label: 'Open orders', value: '12' },
          { label: 'Waiting on client', value: '3' },
          { label: 'Updates today', value: '5' },
        ],
        sections: [
          {
            name: 'Status',
            items: [
              { title: 'Order 24018', subtitle: 'Cabinet install on site', meta: 'Crew booked Friday', tone: 'accent' },
              { title: 'Order 24022', subtitle: 'Two items on supplier hold', meta: 'Account team following up', tone: 'warn' },
            ],
          },
          {
            name: 'Approvals',
            items: [
              { title: 'Approve revised stone sample', subtitle: 'Client sign-off required', meta: '1 pending', tone: 'neutral' },
            ],
          },
          {
            name: 'Files',
            items: [
              { title: 'delivery-pack-24018.pdf', subtitle: 'Uploaded 09:10', meta: 'Account team', tone: 'neutral' },
            ],
          },
        ],
      },
    ],
  },
]

export const FREE_TOOLS: FreeTool[] = [
  { name: 'Find clients', tagline: 'Front-end proof for the Sales System: search and save target accounts.', route: '/find-companies' },
  { name: 'Clean a list', tagline: 'Lead cleanup proof: turn a rough company list into a usable sales queue.', route: '/company-list' },
  { name: 'Sort updates', tagline: 'Ops intake proof: turn messy team updates into one working inbox.', route: '/sort-updates' },
]

export const CUSTOM_BUILD_EXAMPLES = [
  'Approval Flow',
  'QR Ordering',
  'Commerce Back Office',
  'Document Intake',
  'Supplier Portal',
  'Internal Learning Hub',
]

export function getSiteSystem(systemIdOrSlug: string | null | undefined) {
  const normalized = String(systemIdOrSlug || '')
    .trim()
    .toLowerCase()
  return SITE_SYSTEMS.find((item) => item.id === normalized || item.slug === normalized || item.name.toLowerCase() === normalized) ?? null
}
