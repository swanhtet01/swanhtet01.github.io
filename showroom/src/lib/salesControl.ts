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
    query: 'spa in yangon',
    keywords: ['spa', 'wellness', 'massage', 'yangon'],
    why: 'Use this when testing owner-led businesses that still run on inboxes and ad hoc follow-up.',
  },
  {
    id: 'commercial-distributors',
    name: 'Commercial distributors',
    query: 'auto parts distributor in yangon',
    keywords: ['distributor', 'wholesale', 'auto parts', 'yangon'],
    why: 'Use this when selling Commercial Control to trading or distribution teams.',
  },
  {
    id: 'factory-supply',
    name: 'Factory and supply',
    query: 'industrial warehouse in myanmar',
    keywords: ['industrial', 'warehouse', 'factory', 'myanmar'],
    why: 'Use this when looking for Factory Control targets with stores or inbound complexity.',
  },
]

export function defaultHuntTemplate() {
  return HUNT_TEMPLATES[0]
}
