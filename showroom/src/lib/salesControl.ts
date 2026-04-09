export type SellableSolution = {
  id: string
  name: string
  buyer: string
  pain: string
  replaces: string
  promise: string
  modules: string[]
  pilot: string
}

export type QuickWinProduct = {
  id: string
  name: string
  useCase: string
}

export type StarterPackDetail = {
  id: string
  slug: string
  name: string
  eyebrow: string
  audience: string
  promise: string
  replaces: string
  image: string
  starterModules: string[]
  knowledgeModules: string[]
  infrastructureModules: string[]
  problemsSolved: string[]
  integrations: string[]
  controls: string[]
  agentLoops: string[]
  usedFor: string[]
  proofTool: { label: string; route: string }
  setupPath: string[]
  dailyUsers: string[]
  expandsTo: string[]
  otherUses: string[]
}

export type PlatformLayerDetail = {
  id: string
  name: string
  layer: 'Application' | 'Knowledge' | 'Infrastructure'
  detail: string
  modules: string[]
}

export type HuntTemplate = {
  id: string
  name: string
  query: string
  keywords: string[]
  why: string
}

export type PublicProduct = {
  id: string
  name: string
  status: 'Live now' | 'Private pack' | 'Add-on'
  audience: string
  promise: string
  route: string
}

export type LabTrack = {
  id: string
  name: string
  loop: string
  why: string
  graduation: string
}

export const CORE_SOLUTIONS: SellableSolution[] = [
  {
    id: 'sales-setup',
    name: 'Find Clients',
    buyer: 'Sales teams, founders, and operators that need new companies to contact.',
    pain: 'Use this when prospecting still happens across search, tabs, chats, and loose notes.',
    replaces: 'manual prospecting, copied links, and scattered lead lists',
    promise: 'Search for companies, keep the right ones, and move them into one shared follow-up list.',
    modules: ['Find Clients', 'Company List'],
    pilot: '1-week pilot with one market search, one shortlist, and one live follow-up list.',
  },
  {
    id: 'company-cleanup',
    name: 'Company List',
    buyer: 'Teams that already have spreadsheets, exports, or messy company lists.',
    pain: 'Use this when the company list exists but nobody trusts it enough to work from it.',
    replaces: 'dirty exports, duplicated rows, and follow-up hidden inside spreadsheets',
    promise: 'Clean the list, remove duplicates, and keep the next step visible.',
    modules: ['Company List', 'Task List'],
    pilot: '1-week cleanup around one imported list and one shared task list.',
  },
  {
    id: 'receiving-control',
    name: 'Receiving Control',
    buyer: 'Plants, stores, procurement, and operations teams.',
    pain: 'Sell this when GRN gaps, shortages, holds, and receiving blockers live in chats or paper notes.',
    replaces: 'paper receiving logs, chat chasing, and missed inbound exceptions',
    promise: 'Log receiving issues once and keep the next action visible.',
    modules: ['Receiving Log', 'Task List'],
    pilot: '2-week pilot with one inbound lane, one owner map, and one short exception queue.',
  },
]

export const QUICK_WIN_PRODUCTS: QuickWinProduct[] = [
  {
    id: 'founder-brief',
    name: 'Daily Summary',
    useCase: 'Add this when the owner wants one short review instead of chasing updates manually.',
  },
  {
    id: 'reply-draft',
    name: 'Reply Draft',
    useCase: 'Add this when the same supplier or customer replies are written again and again.',
  },
  {
    id: 'receiving-watch',
    name: 'Exception Watch',
    useCase: 'Add this when repeat receiving issues should create alerts automatically.',
  },
]

export const PLATFORM_LAYER_DETAILS: PlatformLayerDetail[] = [
  {
    id: 'application-layer',
    name: 'Products',
    layer: 'Application',
    detail: 'The live screens teams actually open every day.',
    modules: ['Find Clients', 'Company List', 'Receiving Log', 'Task List', 'Client Portal', 'Daily Summary'],
  },
  {
    id: 'knowledge-layer',
    name: 'Shared data',
    layer: 'Knowledge',
    detail: 'The shared records, notes, files, and decisions behind every product and every tenant.',
    modules: ['Company Records', 'Decision Log', 'Document Intake', 'Knowledge Base'],
  },
  {
    id: 'infrastructure-layer',
    name: 'Connections and automation',
    layer: 'Infrastructure',
    detail: 'The connections, rules, permissions, audit, and background jobs that keep the system moving.',
    modules: ['Connectors', 'Workflow Rules', 'Automation Jobs', 'Permissions', 'Audit Trail', 'Health Checks'],
  },
]

export const PUBLIC_PRODUCTS: PublicProduct[] = [
  {
    id: 'find-companies',
    name: 'Find Clients',
    status: 'Live now',
    audience: 'Founders, operators, and sales teams that need net-new companies to contact.',
    promise: 'Search by place or niche, keep the shortlist, and create the first follow-up.',
    route: '/find-companies',
  },
  {
    id: 'company-list',
    name: 'Company List',
    status: 'Live now',
    audience: 'Teams that already have a company list, scraped export, or CRM dump.',
    promise: 'Paste names from Google, Facebook, WhatsApp, Excel, or CRM and turn them into one usable list.',
    route: '/company-list',
  },
  {
    id: 'reply-draft',
    name: 'Reply Draft',
    status: 'Add-on',
    audience: 'Teams replying to similar supplier and customer threads every day.',
    promise: 'Draft repetitive replies faster with the right context attached.',
    route: '/app/sales',
  },
  {
    id: 'founder-brief',
    name: 'Founder Brief',
    status: 'Add-on',
    audience: 'Owners who want one short daily review instead of ten chats.',
    promise: 'Condense open actions, issues, and decisions into one short review.',
    route: '/app/director',
  },
]

export const LAB_TRACKS: LabTrack[] = [
  {
    id: 'revenue-scout',
    name: 'New company watch',
    loop: 'Reruns saved company searches and pushes new candidates into the shared list.',
    why: 'Turns Find Clients from a one-shot search into a recurring revenue loop.',
    graduation: 'Needs better ranking, dedupe, and recovery email.',
  },
  {
    id: 'list-clerk',
    name: 'List cleanup',
    loop: 'Cleans imported rows, normalizes contacts, and keeps the company list usable.',
    why: 'Stops every new client setup from turning into manual spreadsheet cleanup.',
    graduation: 'Needs stronger field validation and merge controls.',
  },
  {
    id: 'task-triage',
    name: 'Task triage',
    loop: 'Turns messy updates and receiving notes into short, owned next steps.',
    why: 'Moves teams from reporting work to acting on the next issue fast.',
    graduation: 'Needs richer templates and approval rules for edits.',
  },
  {
    id: 'founder-brief',
    name: 'Daily summary',
    loop: 'Generates the daily brief from live leads, tasks, and issue state.',
    why: 'Gives owners one review surface instead of scattered chats and spreadsheets.',
    graduation: 'Needs delivery rules, approvals, and better eval coverage.',
  },
]

export const STARTER_PACK_DETAILS: StarterPackDetail[] = [
  {
    id: 'sales-setup',
    slug: 'find-clients',
    name: 'Find Clients',
    eyebrow: 'Live product',
    audience: 'Founders, operators, and sales teams',
    promise: 'Search for companies, keep the right ones, and move them into one shared follow-up list.',
    replaces: 'manual prospecting, copied links, and scattered lead lists',
    image: '/site/find-clients-live.png',
    starterModules: ['Find Clients', 'Company List'],
    knowledgeModules: ['Company Records', 'Notes and decisions'],
    infrastructureModules: ['Connectors', 'Automation rules', 'Permissions and history'],
    problemsSolved: [
      'Build a clean shortlist of distributors, dealers, or partners in a new market.',
      'Turn raw search results into owned follow-up instead of bookmarks and open tabs.',
      'Keep first outreach, notes, and next step together for the team.',
    ],
    integrations: ['Gmail', 'Google Sheets', 'Google Drive', 'CSV', 'API'],
    controls: ['Search history', 'Row ownership', 'Notes history', 'Role-based edits'],
    agentLoops: ['New company watch', 'List cleanup', 'Daily summary'],
    usedFor: ['new prospecting', 'channel mapping', 'partner outreach'],
    proofTool: { label: 'Find Clients', route: '/find-companies' },
    setupPath: [
      'Run one focused market search.',
      'Keep the best-fit companies in the shared list.',
      'Create the first follow-up tasks.',
      'Let the background automations keep it moving.',
    ],
    dailyUsers: ['founder', 'sales operator', 'sales manager'],
    expandsTo: ['Reply Draft', 'Daily Summary', 'Client Portal'],
    otherUses: ['territory build-out', 'new channel launch', 'partnership outreach'],
  },
  {
    id: 'company-cleanup',
    slug: 'company-list',
    name: 'Company List',
    eyebrow: 'Live product',
    audience: 'Teams working from exports, spreadsheets, or CRM dumps',
    promise: 'Turn a messy list into one clean company list with owners and next steps.',
    replaces: 'dirty exports, duplicated rows, and follow-up hidden inside spreadsheets',
    image: '/site/company-list-live.png',
    starterModules: ['Company List', 'Task List'],
    knowledgeModules: ['Company Records', 'Imported notes'],
    infrastructureModules: ['File imports', 'Automation rules', 'Permissions and history'],
    problemsSolved: [
      'Clean a CRM export before the team starts calling from it.',
      'Merge sheet rows, scraped lists, and inbox notes into one working list.',
      'Assign owners and next steps to each kept company.',
    ],
    integrations: ['CSV', 'Google Sheets', 'Google Drive', 'Gmail', 'CRM export'],
    controls: ['Dedupe review', 'Import history', 'Role-based edits', 'Audit trail'],
    agentLoops: ['List cleanup', 'Task triage', 'Daily summary'],
    usedFor: ['CRM cleanup', 'event lead cleanup', 'customer list rebuild'],
    proofTool: { label: 'Company List', route: '/company-list' },
    setupPath: [
      'Import the list the team already uses.',
      'Clean and tag the rows that are ready to work.',
      'Assign one next step beside each kept company.',
      'Let the cleanup and task rules keep the list usable.',
    ],
    dailyUsers: ['founder', 'sales coordinator', 'list clerk'],
    expandsTo: ['Reply Draft', 'Daily Summary', 'Approval Flow'],
    otherUses: ['partner database cleanup', 'supplier master rebuild', 'sales handover preparation'],
  },
  {
    id: 'receiving-control',
    slug: 'receiving-control',
    name: 'Receiving Control',
    eyebrow: 'Live product',
    audience: 'Warehouses, plants, procurement teams, and receiving teams',
    promise: 'Track shortages, holds, GRN gaps, and next actions in one shared queue.',
    replaces: 'paper receiving logs, chat follow-up, and missed inbound exceptions',
    image: '/site/receiving-control-live.png',
    starterModules: ['Receiving Log', 'Task List'],
    knowledgeModules: ['Attached documents', 'Issue notes'],
    infrastructureModules: ['Workflow rules', 'Alerts', 'Permissions and history'],
    problemsSolved: [
      'Track shortages, holds, and missing GRN evidence in one queue.',
      'Route supplier follow-up without losing files, notes, or decision history.',
      'Give plant and procurement managers the same live exception view.',
    ],
    integrations: ['Gmail', 'Google Drive', 'Google Sheets', 'ERP extracts', 'Uploaded documents'],
    controls: ['Role-based queues', 'Approval gates', 'Attachment history', 'Exception audit'],
    agentLoops: ['Task triage', 'Exception watch', 'Daily summary'],
    usedFor: ['warehouse receiving', 'plant inbound checks', 'supplier exception control'],
    proofTool: { label: 'Receiving Log', route: '/receiving-log' },
    setupPath: [
      'Start with one inbound lane or one supplier problem.',
      'Log each issue once and assign one owner.',
      'Review open holds in one short daily check.',
      'Let the automation keep exceptions visible.',
    ],
    dailyUsers: ['receiving clerk', 'procurement lead', 'manager'],
    expandsTo: ['Daily Summary', 'Approval Flow', 'Document Intake'],
    otherUses: ['store delivery intake', 'procurement issue control', 'goods hold escalation'],
  },
]

export function getStarterPackDetail(productIdOrSlug: string | null | undefined) {
  const normalized = String(productIdOrSlug || '')
    .trim()
    .toLowerCase()
  const aliases: Record<string, string> = {
    'distributor-sales-desk': 'sales-setup',
    'list-cleanup-desk': 'company-cleanup',
    'find-companies': 'sales-setup',
    'find clients': 'sales-setup',
    'company list': 'company-cleanup',
  }
  const resolved = aliases[normalized] ?? normalized
  return (
    STARTER_PACK_DETAILS.find((pack) => pack.slug === resolved || pack.id === resolved || pack.name.toLowerCase() === resolved) ??
    null
  )
}

export const FINDER_ADVANTAGES = [
  'Search gives raw names. SUPERMEGA.dev gives you a shortlist you can actually work from.',
  'Each kept company carries fit reasons, contact clues, and the first follow-up instead of becoming another bookmark.',
  'Already have names? Company List turns messy rows into one usable list without manual cleanup.',
  'Saved searches rerun the same market search without starting from zero each time.',
]

export const HUNT_TEMPLATES: HuntTemplate[] = [
  {
    id: 'local-services',
    name: 'Local service businesses',
    query: 'local service business',
    keywords: ['service', 'local', 'business'],
    why: 'Use this when targeting local businesses that still manage outreach from inboxes and spreadsheets.',
  },
  {
    id: 'commercial-distributors',
    name: 'Regional distributors',
    query: 'regional distributor',
    keywords: ['distributor', 'wholesale', 'regional'],
    why: 'Use this when targeting trading and distribution teams that need cleaner company lists and follow-up.',
  },
  {
    id: 'industrial-suppliers',
    name: 'Industrial suppliers',
    query: 'industrial supplier',
    keywords: ['industrial', 'supplier', 'factory'],
    why: 'Use this when looking for plants, warehouses, or suppliers that need receiving control.',
  },
]

export function defaultHuntTemplate() {
  return HUNT_TEMPLATES[0]
}

export function normalizeSolutionPack(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (['distributor sales desk', 'sales setup', 'sales desk', 'action os starter', 'lead finder', 'find clients', 'find companies'].includes(normalized)) {
    return 'Find Clients'
  }
  if (['list cleanup desk', 'company cleanup', 'commercial control', 'workspace', 'company list', 'clean my list'].includes(normalized)) {
    return 'Company List'
  }
  if (['receiving control', 'receiving log', 'factory control'].includes(normalized)) {
    return 'Receiving Control'
  }
  return 'Find Clients'
}

export function defaultWedgeProduct(pack: string | null | undefined) {
  const normalized = normalizeSolutionPack(pack)
  if (normalized === 'Company List') {
    return 'Company List'
  }
  if (normalized === 'Receiving Control') {
    return 'Receiving Log'
  }
  return 'Find Clients'
}

export function defaultStarterModules(pack: string | null | undefined) {
  const normalized = normalizeSolutionPack(pack)
  if (normalized === 'Company List') {
    return ['Company List', 'Task List']
  }
  if (normalized === 'Receiving Control') {
    return ['Receiving Log', 'Task List']
  }
  return ['Find Clients', 'Company List']
}
