export type SellableSolution = {
  id: string
  name: string
  buyer: string
  pain: string
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
    id: 'action-os-starter',
    name: 'Action OS Starter',
    buyer: 'Owner-led teams still running on Gmail, Drive, Sheets, and manual follow-up.',
    pain: 'Sell this when follow-up is scattered and nobody owns the next step cleanly.',
    promise: 'One saved queue for leads, blockers, and next actions.',
    modules: ['Action OS Starter'],
    pilot: '2-week pilot with one queue, one owner map, and one review rhythm.',
  },
  {
    id: 'commercial-control',
    name: 'Commercial Control',
    buyer: 'Distributors, traders, and finance-commercial teams.',
    pain: 'Sell this when overdue follow-up, supplier updates, and sales signals live in separate sheets or chats.',
    promise: 'One control loop for cash, sales, and supplier follow-up.',
    modules: ['Action OS Starter', 'Cash Watch', 'Sales Signal', 'Supplier Watch'],
    pilot: 'Pilot around one overdue queue and one commercial watchlist.',
  },
  {
    id: 'factory-control',
    name: 'Factory Control',
    buyer: 'Plants, stores, procurement, and operations managers.',
    pain: 'Sell this when receiving, stock, supplier, and quality issues are noticed too late.',
    promise: 'One working layer for inbound receipt, stock pressure, and supplier risk.',
    modules: ['Action OS Starter', 'Receiving Control', 'Inventory Pulse', 'Supplier Watch'],
    pilot: 'Pilot around one site or store lane with receiving and stock visibility first.',
  },
]

export const QUICK_WIN_PRODUCTS: QuickWinProduct[] = [
  {
    id: 'director-flash',
    name: 'Director Flash',
    useCase: 'Add this when the owner wants one short daily brief instead of reading chats and spreadsheets.',
  },
  {
    id: 'reply-draft',
    name: 'Reply Draft',
    useCase: 'Add this when supplier or customer follow-up repeats the same thread every day.',
  },
  {
    id: 'document-intake',
    name: 'Document Intake',
    useCase: 'Add this when files, screenshots, or emails need to become structured records fast.',
  },
]

export const PUBLIC_PRODUCTS: PublicProduct[] = [
  {
    id: 'lead-finder',
    name: 'Lead Finder',
    status: 'Live now',
    audience: 'Founders, operators, and sales teams that need net-new pipeline.',
    promise: 'Search a market, keep the shortlist, and start outreach in one flow.',
    route: '/lead-finder',
  },
  {
    id: 'action-os-starter',
    name: 'Action OS Starter',
    status: 'Live now',
    audience: 'Any team with messy updates, missed follow-up, and unclear owners.',
    promise: 'Turn pasted updates and blockers into one simple queue.',
    route: '/workspace?setup=updates&view=queue',
  },
  {
    id: 'workspace',
    name: 'Workspace',
    status: 'Live now',
    audience: 'Anyone who already has a lead list, notes, or ops issues.',
    promise: 'Bring your own data and keep the leads and queue together.',
    route: '/workspace',
  },
  {
    id: 'receiving-control',
    name: 'Receiving Control',
    status: 'Private pack',
    audience: 'Procurement, stores, and plant teams with inbound issues.',
    promise: 'Log receiving issues once and keep the next action visible.',
    route: '/workspace?setup=receiving&view=queue',
  },
  {
    id: 'reply-draft',
    name: 'Reply Draft',
    status: 'Add-on',
    audience: 'Teams replying to the same supplier and customer threads every day.',
    promise: 'Draft repetitive replies faster with context already attached.',
    route: '/app/sales',
  },
  {
    id: 'director-flash',
    name: 'Director Flash',
    status: 'Add-on',
    audience: 'Owners who want the short daily brief instead of ten chats.',
    promise: 'Condense open actions, issues, and decisions into one short review.',
    route: '/app/director',
  },
]

export const LAB_TRACKS: LabTrack[] = [
  {
    id: 'hunt-agent',
    name: 'Hunt Agent',
    loop: 'Saved lead hunts rerun and add qualified leads automatically.',
    why: 'Makes Lead Finder a recurring pipeline engine instead of a one-shot search.',
    graduation: 'Needs durable scheduling, dedupe quality checks, and recovery.',
  },
  {
    id: 'inbox-agent',
    name: 'Inbox Agent',
    loop: 'Turns messy email threads into queue items, reply drafts, and owner handoffs.',
    why: 'Cuts the inbox out of daily follow-up work.',
    graduation: 'Needs mailbox auth, guardrails, and approval checkpoints.',
  },
  {
    id: 'exception-agent',
    name: 'Exception Agent',
    loop: 'Watches receiving, stock, quality, and cash signals and creates queue items when thresholds break.',
    why: 'Moves ops from reporting after the fact to acting on exceptions early.',
    graduation: 'Needs live data connectors and shared thresholds by client.',
  },
  {
    id: 'briefing-agent',
    name: 'Briefing Agent',
    loop: 'Generates the daily director brief from live queue and issue state.',
    why: 'Turns the product into something executives check every morning.',
    graduation: 'Needs shared identity, delivery rules, and better evals.',
  },
]

export const FINDER_ADVANTAGES = [
  'Google finds pages. Lead Finder keeps the shortlist and remembers what you are selling.',
  'Facebook shows activity. Lead Finder turns results into a sellable SuperMega offer with the right wedge and next modules.',
  'Saved hunts rerun the same market search without starting from zero every time.',
  'The first follow-up can land in the queue immediately, so search and work stay connected.',
]

export const HUNT_TEMPLATES: HuntTemplate[] = [
  {
    id: 'owner-led-services',
    name: 'Owner-led services',
    query: 'clinic in dubai',
    keywords: ['clinic', 'healthcare', 'medical', 'dubai'],
    why: 'Use this when testing owner-led service businesses that still run on inboxes and ad hoc follow-up.',
  },
  {
    id: 'commercial-distributors',
    name: 'Commercial distributors',
    query: 'industrial distributor in malaysia',
    keywords: ['distributor', 'wholesale', 'industrial', 'malaysia'],
    why: 'Use this when selling Commercial Control to trading or distribution teams.',
  },
  {
    id: 'factory-supply',
    name: 'Factory and supply',
    query: 'industrial warehouse in jakarta',
    keywords: ['industrial', 'warehouse', 'factory', 'jakarta'],
    why: 'Use this when looking for Factory Control targets with stores or inbound complexity.',
  },
]

export function defaultHuntTemplate() {
  return HUNT_TEMPLATES[0]
}
