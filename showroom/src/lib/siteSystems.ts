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

export type ModuleCategory = 'Revenue' | 'Operations' | 'Management' | 'Client'

export type SiteModule = {
  id: string
  systemId: string
  name: string
  category: ModuleCategory
  purpose: string
  users: string
  looksLike: string
  setup: string
  expandsInto: string[]
  proofRoute?: string
}

export type SiteSystem = {
  id: string
  slug: string
  name: string
  shortName: string
  category: ModuleCategory
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
  moduleIds: string[]
  scenarios: DemoScenario[]
}

export type FreeTool = {
  name: string
  tagline: string
  route: string
}

export const MODULE_CATEGORIES: ModuleCategory[] = ['Revenue', 'Operations', 'Management', 'Client']

export const MODULE_LIBRARY: SiteModule[] = [
  {
    id: 'lead-finder',
    systemId: 'sales',
    name: 'Lead Finder',
    category: 'Revenue',
    purpose: 'Find net-new companies and save a shortlist worth following up.',
    users: 'Founders, sales leads, coordinators',
    looksLike: 'Search, shortlist, keep, assign',
    setup: 'Choose one market and one owner, then save only the companies worth a first message.',
    expandsInto: ['Follow-up Queue', 'Quote Tracker'],
    proofRoute: '/find-companies',
  },
  {
    id: 'list-cleaner',
    systemId: 'sales',
    name: 'List Cleaner',
    category: 'Revenue',
    purpose: 'Turn a rough company list into one clean working queue.',
    users: 'Sales admins, coordinators, founders',
    looksLike: 'Paste, clean, stage, assign',
    setup: 'Import a sheet or pasted names, then normalize owners, stages, and next steps.',
    expandsInto: ['Follow-up Queue'],
    proofRoute: '/company-list',
  },
  {
    id: 'follow-up-queue',
    systemId: 'sales',
    name: 'Follow-up Queue',
    category: 'Revenue',
    purpose: 'Keep one owner and one next action on every live account.',
    users: 'Sales reps, account owners, managers',
    looksLike: 'Owned accounts, due dates, next step, reply state',
    setup: 'Start with the active accounts and assign a due date rule for every stage.',
    expandsInto: ['Quote Tracker', 'Founder Brief'],
  },
  {
    id: 'quote-tracker',
    systemId: 'sales',
    name: 'Quote Tracker',
    category: 'Revenue',
    purpose: 'Track sent quotes, reply risk, and stalled commercial conversations.',
    users: 'Sales leads, estimators, founder review',
    looksLike: 'Quote sent, waiting reply, follow-up due',
    setup: 'Add quote milestones only after the core follow-up flow is in daily use.',
    expandsInto: ['Client Portal'],
  },
  {
    id: 'ops-inbox',
    systemId: 'operations',
    name: 'Ops Inbox',
    category: 'Operations',
    purpose: 'Catch requests, issues, and updates in one owned queue.',
    users: 'Ops leads, service teams, admin teams',
    looksLike: 'Inbox, owner, status, blocker',
    setup: 'Pick one live intake channel and one owner model before adding anything else.',
    expandsInto: ['Approval Flow', 'Document Intake'],
    proofRoute: '/sort-updates',
  },
  {
    id: 'approval-flow',
    systemId: 'operations',
    name: 'Approval Flow',
    category: 'Operations',
    purpose: 'Move sign-offs out of chat and into one visible decision path.',
    users: 'Managers, procurement, finance, ops leads',
    looksLike: 'Pending, approved, rejected, audit trail',
    setup: 'Define who can approve, what triggers approval, and what happens after the decision.',
    expandsInto: ['Founder Brief'],
  },
  {
    id: 'receiving-log',
    systemId: 'operations',
    name: 'Receiving Log',
    category: 'Operations',
    purpose: 'Log shortages, damage, and variance once and keep the next owner visible.',
    users: 'Warehouse teams, plant teams, back-of-house teams',
    looksLike: 'PO, issue reason, owner, supplier follow-up',
    setup: 'Start with one receiving queue and a short list of issue reasons.',
    expandsInto: ['Supplier Portal', 'KPI Watch'],
  },
  {
    id: 'document-intake',
    systemId: 'operations',
    name: 'Document Intake',
    category: 'Operations',
    purpose: 'Collect inbound documents and convert them into owned work.',
    users: 'Finance, procurement, admin, back office',
    looksLike: 'Inbox, type, owner, status',
    setup: 'Pick the first document class and map the next action for each incoming file.',
    expandsInto: ['Approval Flow', 'Client Portal'],
  },
  {
    id: 'founder-brief-module',
    systemId: 'brief',
    name: 'Founder Brief',
    category: 'Management',
    purpose: 'Show the few items that need founder or GM attention today.',
    users: 'Founders, GMs, directors',
    looksLike: 'Priority items, watch items, wins',
    setup: 'Connect one sales and one operations surface before widening the brief.',
    expandsInto: ['KPI Watch', 'Decision Journal'],
  },
  {
    id: 'kpi-watch',
    systemId: 'brief',
    name: 'KPI Watch',
    category: 'Management',
    purpose: 'Watch targets, misses, and stale numbers without a heavy dashboard project.',
    users: 'Founders, controllers, managers',
    looksLike: 'Targets, trend, exception flag, owner',
    setup: 'Choose a short KPI set first, then add thresholds that create action when something slips.',
    expandsInto: ['Founder Brief'],
  },
  {
    id: 'client-portal-module',
    systemId: 'portal',
    name: 'Client Portal',
    category: 'Client',
    purpose: 'Give customers one clean place for status, approvals, files, and requests.',
    users: 'Service teams, agencies, B2B account managers',
    looksLike: 'Status, approvals, files, requests',
    setup: 'Start with one client-facing milestone view, then connect approvals and delivery updates.',
    expandsInto: ['Learning Hub', 'Support Desk'],
  },
  {
    id: 'learning-hub',
    systemId: 'portal',
    name: 'Learning Hub',
    category: 'Client',
    purpose: 'Turn onboarding, SOPs, and training into a trackable flow.',
    users: 'Internal teams, partners, client onboarding teams',
    looksLike: 'Modules, completion, checkpoints, manager view',
    setup: 'Pick one onboarding path and define the checkpoints before widening the library.',
    expandsInto: ['Client Portal'],
  },
]

export const SITE_SYSTEMS: SiteSystem[] = [
  {
    id: 'sales',
    slug: 'sales-system',
    name: 'Sales System',
    shortName: 'Sales',
    category: 'Revenue',
    tagline: 'Find companies, clean lists, and keep every next step moving from one sales surface.',
    audience: 'Founders, sales leads, coordinators, commercial teams',
    summary: 'A shared sales system for target accounts, cleaned lists, follow-up, and quote progress.',
    previewImage: '/site/sales-system-screen.png',
    previewAlt: 'Sales System screenshot showing new accounts, follow-up today, and reply-ready lanes.',
    previewNote: 'Synthetic current-branch sample data.',
    surface: [
      'One board for new accounts, working accounts, and reply-ready deals',
      'Each company has an owner, a next step, and concise context',
      'Managers can spot stalled deals and quote risk in one pass',
    ],
    replaces: ['manual prospecting', 'spreadsheet follow-up', 'lost quote replies'],
    dailyUse: ['find or import accounts', "assign today's follow-ups", 'review stalled deals before they go cold'],
    setup: ['start with one live list or CRM export', 'map owners, stages, and follow-up rules', 'add quote tracking only after the base flow is in daily use'],
    nextBuilds: ['dealer portal', 'territory view', 'contact intake'],
    demoCta: 'Open Sales System demo',
    freeToolLabel: 'Find clients proof',
    freeToolRoute: '/find-companies',
    moduleIds: ['lead-finder', 'list-cleaner', 'follow-up-queue', 'quote-tracker'],
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
              { title: 'North Delta Hardware', subtitle: 'Distributor shortlist', meta: 'Call after 3 PM', tone: 'neutral' },
              { title: 'Riverline Tools', subtitle: 'Importer list', meta: 'Public page active', tone: 'accent' },
            ],
          },
          {
            name: 'Follow-up today',
            items: [
              { title: 'Summit Fasteners', subtitle: 'Quote sent yesterday', meta: 'Owner: Ko Aung', tone: 'warn' },
              { title: 'Harbor Parts Supply', subtitle: 'Need buyer contact', meta: 'Owner: Swan', tone: 'neutral' },
            ],
          },
          {
            name: 'Reply ready',
            items: [{ title: 'Unity Components', subtitle: 'Asked for product sheet', meta: 'Draft reply ready', tone: 'accent' }],
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
              { title: 'Hilltop Logistics', subtitle: 'Referral lead', meta: 'Need intro message', tone: 'accent' },
              { title: 'East Yard Services', subtitle: 'Operations contact', meta: 'Seen on Viber', tone: 'neutral' },
            ],
          },
          {
            name: 'Follow-up today',
            items: [{ title: 'Delta Freight Hub', subtitle: 'Proposal requested', meta: 'Follow up Friday', tone: 'warn' }],
          },
          {
            name: 'Reply ready',
            items: [{ title: 'Metro Warehousing', subtitle: 'Asked about pricing', meta: 'Reply draft ready', tone: 'accent' }],
          },
        ],
      },
    ],
  },
  {
    id: 'operations',
    slug: 'operations-inbox',
    name: 'Operations Inbox',
    shortName: 'Ops',
    category: 'Operations',
    tagline: 'Turn requests, issues, approvals, and documents into one owned operations queue.',
    audience: 'Operations leads, warehouse teams, service teams, admin teams',
    summary: 'A single operations system for intake, approvals, receiving issues, and document work.',
    previewImage: '/site/ops-inbox-screen.png',
    previewAlt: 'Operations Inbox screenshot showing the inbox and approvals side by side.',
    previewNote: 'Synthetic current-branch sample data.',
    surface: [
      'New work enters one inbox instead of chat fragments',
      'Approvals and exceptions sit beside the working queue',
      'Late items, blockers, and owners stay visible until cleared',
    ],
    replaces: ['chat-based operations', 'paper logs', 'missing ownership'],
    dailyUse: ['capture requests or issues', 'assign an owner and clear the next blocker', 'review late items and approvals once per shift'],
    setup: ['pick one live queue such as service, warehouse, or back office', 'define statuses, owners, and escalation timers', 'connect the first intake channel and keep it simple'],
    nextBuilds: ['QR ordering', 'commerce back office', 'supplier portal'],
    demoCta: 'Open Operations Inbox demo',
    freeToolLabel: 'Sort updates proof',
    freeToolRoute: '/sort-updates',
    moduleIds: ['ops-inbox', 'approval-flow', 'receiving-log', 'document-intake'],
    scenarios: [
      {
        id: 'restaurant',
        label: 'Service queue',
        kind: 'operations',
        context: 'A service team routing requests, changes, and approvals through one inbox.',
        metrics: [
          { label: 'Open requests', value: '14' },
          { label: 'Late items', value: '2' },
          { label: 'Need approval', value: '1' },
        ],
        inbox: [
          { title: 'Store 04', subtitle: 'Menu board update', meta: 'Owner: Nilar', tone: 'accent' },
          { title: 'Counter request', subtitle: 'Refund review', meta: 'Needs approval', tone: 'warn' },
          { title: 'Support chat', subtitle: 'Missing invoice copy', meta: 'Owner: Min', tone: 'neutral' },
        ],
        approvals: [
          { title: 'Refund request', subtitle: 'One cancelled lunch set', meta: 'Manager sign-off', tone: 'warn' },
          { title: 'Price change', subtitle: 'Lunch combo', meta: 'Pending owner', tone: 'neutral' },
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
    category: 'Management',
    tagline: 'See what needs attention without chasing updates across the company.',
    audience: 'Founders, GMs, directors, site leads',
    summary: 'A daily management surface built from the live systems, with priorities, KPI misses, and decisions in one place.',
    previewImage: '/site/founder-brief-screen.png',
    previewAlt: 'Founder Brief screenshot showing priority items, watch items, and wins.',
    previewNote: 'Synthetic current-branch sample data.',
    surface: [
      'Priority items grouped by business function',
      'Approvals, risks, and stale work surfaced automatically',
      'Wins and movement pulled from the live systems, not manual reporting',
    ],
    replaces: ['manual status chasing', 'stale dashboards', 'late escalations'],
    dailyUse: ['review top risks and overdue items', 'approve blocked work in minutes', 'see where sales or operations need intervention'],
    setup: ['connect one sales and one operations surface first', 'define thresholds for escalations and stale work', 'schedule the brief for the founder or GM each morning'],
    nextBuilds: ['decision journal', 'weekly review pack', 'board packet'],
    demoCta: 'Open Founder Brief demo',
    moduleIds: ['founder-brief-module', 'kpi-watch'],
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
          { title: 'Service queue is backing up', subtitle: 'Counter + kitchen', meta: 'Need extra shift lead', tone: 'warn' },
          { title: 'Client portal rollout ready for review', subtitle: 'Delivery pod', meta: 'Approve today', tone: 'accent' },
        ],
        watch: [
          { title: 'Dispatch update missing', subtitle: 'North route', meta: 'Ops follow-up', tone: 'neutral' },
          { title: 'One deal stalled 8 days', subtitle: 'Sales system', meta: 'Founder nudge', tone: 'warn' },
        ],
        wins: [{ title: 'Customer approval turnaround down to 2h', subtitle: 'Portal queue', meta: 'Service team', tone: 'accent' }],
      },
    ],
  },
  {
    id: 'portal',
    slug: 'client-portal',
    name: 'Client Portal',
    shortName: 'Portal',
    category: 'Client',
    tagline: 'Give clients one clean place for status, approvals, files, and onboarding.',
    audience: 'Agencies, service firms, implementation teams, account managers',
    summary: 'A client-facing system for status, approvals, files, requests, and learning handoff.',
    previewImage: '/site/client-portal-screen.png',
    previewAlt: 'Client Portal screenshot showing status, approvals, and files in one client-facing workspace.',
    previewNote: 'Synthetic current-branch sample data.',
    surface: [
      'Live status by project, order, or account',
      'Approvals and requests with full history',
      'Files, notes, and next actions in the same client view',
    ],
    replaces: ['email chasing', 'scattered files', 'manual status updates'],
    dailyUse: ['share status without manual update emails', 'collect client approvals and requests', 'keep delivery and account teams aligned'],
    setup: ['define the client milestones and views', 'connect the delivery queue, files, and approval steps', 'invite the internal team first, then roll it out to clients'],
    nextBuilds: ['support desk', 'billing status', 'knowledge base'],
    demoCta: 'Open Client Portal demo',
    moduleIds: ['client-portal-module', 'learning-hub'],
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
            items: [{ title: 'Approve new banner set', subtitle: 'Client sign-off required', meta: '1 pending', tone: 'neutral' }],
          },
          {
            name: 'Files',
            items: [{ title: 'brand-assets-v3.zip', subtitle: 'Uploaded 08:30', meta: 'Design team', tone: 'neutral' }],
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
            items: [{ title: 'Approve revised material sample', subtitle: 'Client sign-off required', meta: '1 pending', tone: 'neutral' }],
          },
          {
            name: 'Files',
            items: [{ title: 'delivery-pack-24018.pdf', subtitle: 'Uploaded 09:10', meta: 'Account team', tone: 'neutral' }],
          },
        ],
      },
    ],
  },
]

export const FREE_TOOLS: FreeTool[] = [
  { name: 'Find clients', tagline: 'Proof of the Lead Finder module inside the Sales System.', route: '/find-companies' },
  { name: 'Clean a list', tagline: 'Proof of the List Cleaner module for imported company names.', route: '/company-list' },
  { name: 'Sort updates', tagline: 'Proof of the Ops Inbox module for messy operational updates.', route: '/sort-updates' },
]

export const CUSTOM_BUILD_EXAMPLES = ['QR Ordering', 'Commerce Back Office', 'Support Desk', 'Supplier Portal', 'Approval Rules', 'Knowledge Base']

export function getSiteSystem(systemIdOrSlug: string | null | undefined) {
  const normalized = String(systemIdOrSlug || '')
    .trim()
    .toLowerCase()
  return SITE_SYSTEMS.find((item) => item.id === normalized || item.slug === normalized || item.name.toLowerCase() === normalized) ?? null
}

export function getSystemModules(systemIdOrSlug: string | null | undefined) {
  const system = getSiteSystem(systemIdOrSlug)
  if (!system) return []
  return system.moduleIds
    .map((moduleId) => MODULE_LIBRARY.find((item) => item.id === moduleId))
    .filter((item): item is SiteModule => Boolean(item))
}

export function getModuleCategoryGroups() {
  return MODULE_CATEGORIES.map((category) => ({
    category,
    modules: MODULE_LIBRARY.filter((item) => item.category === category),
  }))
}
