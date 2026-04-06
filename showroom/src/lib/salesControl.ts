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
    name: 'Distributor Sales Desk',
    buyer: 'Owner-led teams that need net-new companies and a simple outreach list.',
    pain: 'Sell this when the team is still prospecting from Google, Facebook, or scattered notes.',
    replaces: 'raw search, scattered spreadsheets, and manual outreach tracking',
    promise: 'Search the market, keep the shortlist, and create the first follow-up automatically.',
    modules: ['Find Companies', 'Company List'],
    pilot: '1-week pilot with one market search, one shortlist, and one live follow-up queue.',
  },
  {
    id: 'company-cleanup',
    name: 'List Cleanup Desk',
    buyer: 'Teams that already have spreadsheets, exports, or messy company lists.',
    pain: 'Sell this when the lead list exists but nobody trusts it enough to run outreach cleanly.',
    replaces: 'dirty exports, duplicated rows, and follow-up hidden inside spreadsheets',
    promise: 'Clean the list, remove duplicates, and keep the next follow-up visible.',
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
    name: 'Founder Brief',
    useCase: 'Add this when the owner wants one short daily summary instead of chasing updates manually.',
  },
  {
    id: 'reply-draft',
    name: 'Reply Draft',
    useCase: 'Add this when the same supplier or customer replies are written over and over again.',
  },
  {
    id: 'receiving-watch',
    name: 'Receiving Watch',
    useCase: 'Add this when repeat receiving issues should create escalations automatically.',
  },
]

export const PUBLIC_PRODUCTS: PublicProduct[] = [
  {
    id: 'find-companies',
    name: 'Find clients',
    status: 'Live now',
    audience: 'Founders, operators, and sales teams that need net-new companies to contact.',
    promise: 'Search by place or niche, keep the shortlist, and create the first follow-up.',
    route: '/find-companies',
  },
  {
    id: 'company-list',
    name: 'Clean my list',
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
    name: 'Revenue Scout',
    loop: 'Reruns saved company searches and pushes new candidates into the shared list.',
    why: 'Turns Find Companies from a one-shot search into a recurring revenue loop.',
    graduation: 'Needs better ranking, dedupe, and recovery email.',
  },
  {
    id: 'list-clerk',
    name: 'List Clerk',
    loop: 'Cleans imported rows, normalizes contacts, and keeps the company list usable.',
    why: 'Stops every new client setup from turning into manual spreadsheet cleanup.',
    graduation: 'Needs stronger field validation and merge controls.',
  },
  {
    id: 'task-triage',
    name: 'Task Triage',
    loop: 'Turns messy updates and receiving notes into short, owned next steps.',
    why: 'Moves teams from reporting work to acting on the next issue fast.',
    graduation: 'Needs richer templates and approval rules for edits.',
  },
  {
    id: 'founder-brief',
    name: 'Founder Brief',
    loop: 'Generates the daily brief from live leads, tasks, and issue state.',
    why: 'Gives owners one review surface instead of scattered chats and spreadsheets.',
    graduation: 'Needs delivery rules, approvals, and better eval coverage.',
  },
]

export const FINDER_ADVANTAGES = [
  'Google and Facebook give raw names. SuperMega gives a shortlist you can actually work.',
  'Each kept company carries fit reasons, contact clues, and the first follow-up instead of becoming another bookmark.',
  'Already have names? Clean my list turns messy rows into one usable company list without manual spreadsheet cleanup.',
  'Saved hunts rerun the same market search without starting from zero each time.',
]

export const HUNT_TEMPLATES: HuntTemplate[] = [
  {
    id: 'myanmar-importers',
    name: 'Myanmar importers',
    query: 'importer in yangon',
    keywords: ['importer', 'distributor', 'yangon', 'myanmar'],
    why: 'Use this when targeting owner-led import and distribution teams that still run sales from inboxes and sheets.',
  },
  {
    id: 'commercial-distributors',
    name: 'Regional distributors',
    query: 'industrial distributor in bangkok',
    keywords: ['distributor', 'wholesale', 'industrial', 'bangkok'],
    why: 'Use this when targeting trading and distribution teams that need cleaner company lists and follow-up.',
  },
  {
    id: 'plant-supply',
    name: 'Plant suppliers',
    query: 'industrial supplier in yangon',
    keywords: ['industrial', 'supplier', 'factory', 'yangon'],
    why: 'Use this when looking for plants, warehouses, or suppliers that need receiving control.',
  },
]

export function defaultHuntTemplate() {
  return HUNT_TEMPLATES[0]
}

export function normalizeSolutionPack(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (['distributor sales desk', 'sales setup', 'sales desk', 'action os starter', 'lead finder'].includes(normalized)) {
    return 'Distributor Sales Desk'
  }
  if (['list cleanup desk', 'company cleanup', 'commercial control', 'workspace', 'company list'].includes(normalized)) {
    return 'List Cleanup Desk'
  }
  if (['receiving control', 'receiving log', 'factory control'].includes(normalized)) {
    return 'Receiving Control'
  }
  return 'Distributor Sales Desk'
}

export function defaultWedgeProduct(pack: string | null | undefined) {
  const normalized = normalizeSolutionPack(pack)
  if (normalized === 'List Cleanup Desk') {
    return 'Company List'
  }
  if (normalized === 'Receiving Control') {
    return 'Receiving Log'
  }
  return 'Find Companies'
}

export function defaultStarterModules(pack: string | null | undefined) {
  const normalized = normalizeSolutionPack(pack)
  if (normalized === 'List Cleanup Desk') {
    return ['Company List', 'Task List']
  }
  if (normalized === 'Receiving Control') {
    return ['Receiving Log', 'Task List']
  }
  return ['Find Companies', 'Company List']
}
