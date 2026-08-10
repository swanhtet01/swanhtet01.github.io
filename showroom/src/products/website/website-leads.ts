export const WEBSITE_LEAD_LEDGER_SCHEMA = 'supermega.website.lead-ledger.v1' as const
export const WEBSITE_LEAD_LEDGER_KEY = 'supermega.website.leads.v1'

const MAX_LEADS = 100
const MAX_LEDGER_BYTES = 256 * 1024

export type WebsiteLeadStatus = 'new' | 'qualified' | 'closed'

export type WebsiteLead = {
  id: string
  siteName: string
  sourcePage: string
  name: string
  contact: string
  request: string
  consentRecorded: true
  status: WebsiteLeadStatus
  owner: string
  decisionNote: string
  createdAt: string
  updatedAt: string
}

export type WebsiteLeadLedger = {
  schema: typeof WEBSITE_LEAD_LEDGER_SCHEMA
  revision: number
  leads: WebsiteLead[]
}

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000')
}

function canonicalText(value: unknown, label: string, maximum: number, minimum = 1) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`)
  const normalized = value.trim().normalize('NFC').replace(/\s+/g, ' ')
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if (normalized.length < minimum || normalized.length > maximum || hasControlCharacter) {
    throw new Error(`${label} must contain ${minimum}-${maximum} safe characters.`)
  }
  return normalized
}

function canonicalOptionalText(value: unknown, label: string, maximum: number) {
  if (value === '') return ''
  return canonicalText(value, label, maximum)
}

function canonicalTimestamp(value: unknown, label: string) {
  const timestamp = canonicalText(value, label, 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))) throw new Error(`${label} is invalid.`)
  return timestamp
}

function canonicalLead(value: unknown): WebsiteLead {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'siteName', 'sourcePage', 'name', 'contact', 'request', 'consentRecorded',
    'status', 'owner', 'decisionNote', 'createdAt', 'updatedAt',
  ])) throw new Error('The Website lead record is invalid.')
  const status = value.status
  if (!['new', 'qualified', 'closed'].includes(String(status)) || value.consentRecorded !== true) {
    throw new Error('The Website lead status or consent record is invalid.')
  }
  const lead: WebsiteLead = {
    id: canonicalText(value.id, 'Lead ID', 80),
    siteName: canonicalText(value.siteName, 'Website name', 60),
    sourcePage: canonicalText(value.sourcePage, 'Source page', 120),
    name: canonicalText(value.name, 'Customer name', 80, 2),
    contact: canonicalText(value.contact, 'Customer contact', 120, 3),
    request: canonicalText(value.request, 'Customer request', 500, 3),
    consentRecorded: true,
    status: status as WebsiteLeadStatus,
    owner: canonicalOptionalText(value.owner, 'Lead owner', 120),
    decisionNote: canonicalOptionalText(value.decisionNote, 'Decision note', 500),
    createdAt: canonicalTimestamp(value.createdAt, 'Lead created time'),
    updatedAt: canonicalTimestamp(value.updatedAt, 'Lead updated time'),
  }
  if (lead.updatedAt < lead.createdAt || (lead.status !== 'new' && !lead.owner)) {
    throw new Error('The Website lead history is invalid.')
  }
  return lead
}

export function emptyWebsiteLeadLedger(): WebsiteLeadLedger {
  return { schema: WEBSITE_LEAD_LEDGER_SCHEMA, revision: 0, leads: [] }
}

export function restoreWebsiteLeadLedger(value: unknown): WebsiteLeadLedger | null {
  try {
    if (!isRecord(value)
      || !hasExactKeys(value, ['schema', 'revision', 'leads'])
      || value.schema !== WEBSITE_LEAD_LEDGER_SCHEMA
      || !Number.isSafeInteger(value.revision)
      || Number(value.revision) < 0
      || !Array.isArray(value.leads)
      || value.leads.length > MAX_LEADS) return null
    const leads = value.leads.map(canonicalLead)
    if (new Set(leads.map((lead) => lead.id)).size !== leads.length
      || Number(value.revision) < leads.length) return null
    return { schema: WEBSITE_LEAD_LEDGER_SCHEMA, revision: Number(value.revision), leads }
  } catch {
    return null
  }
}

export type WebsiteStoredLeadsResult =
  | { ok: true; ledger: WebsiteLeadLedger }
  | { ok: false; error: string }

// Read the device-local inbox on behalf of a caller that is about to REPLACE the website workspace
// (onboarding sample, client draft import). Absent storage reads as an empty inbox; unreadable
// storage is refused rather than reported empty, because "cannot read" must never be mistaken for
// "nothing to protect".
export function readStoredWebsiteLeads(storage: StorageReader, subject: string): WebsiteStoredLeadsResult {
  try {
    const raw = storage.getItem(WEBSITE_LEAD_LEDGER_KEY)
    if (raw === null) return { ok: true, ledger: emptyWebsiteLeadLedger() }
    const ledger = restoreWebsiteLeadLedger(JSON.parse(raw))
    if (!ledger) return { ok: false, error: `Website inquiry data needs recovery before ${subject}.` }
    return { ok: true, ledger }
  } catch {
    return { ok: false, error: `Website inquiry data needs recovery before ${subject}.` }
  }
}

export function readWebsiteLeadLedger(storage: StorageReader): WebsiteLeadLedger {
  const raw = storage.getItem(WEBSITE_LEAD_LEDGER_KEY)
  if (!raw) return emptyWebsiteLeadLedger()
  const ledger = restoreWebsiteLeadLedger(JSON.parse(raw))
  if (!ledger) throw new Error('Website lead storage needs recovery before new inquiries can be saved.')
  return ledger
}

export function writeWebsiteLeadLedger(storage: StorageWriter, ledgerValue: unknown) {
  const ledger = restoreWebsiteLeadLedger(ledgerValue)
  if (!ledger) throw new Error('The Website lead ledger is invalid.')
  const serialized = JSON.stringify(ledger)
  if (new TextEncoder().encode(serialized).byteLength > MAX_LEDGER_BYTES) {
    throw new Error('The Website lead ledger is too large. Export and close older inquiries first.')
  }
  storage.setItem(WEBSITE_LEAD_LEDGER_KEY, serialized)
  return ledger
}

export function captureWebsiteLead(
  ledgerValue: unknown,
  input: { siteName: string; sourcePage: string; name: string; contact: string; request: string; consentRecorded: boolean },
  context: { id: string; now: string },
) {
  const ledger = restoreWebsiteLeadLedger(ledgerValue)
  if (!ledger) throw new Error('The Website lead ledger is invalid.')
  if (ledger.leads.length >= MAX_LEADS) throw new Error('Export and close older inquiries before adding another lead.')
  if (input.consentRecorded !== true) throw new Error('Record customer consent before saving contact details.')
  const lead = canonicalLead({
    id: context.id,
    siteName: input.siteName,
    sourcePage: input.sourcePage,
    name: input.name,
    contact: input.contact,
    request: input.request,
    consentRecorded: true,
    status: 'new',
    owner: '',
    decisionNote: '',
    createdAt: context.now,
    updatedAt: context.now,
  })
  if (ledger.leads.some((candidate) => candidate.id === lead.id)) throw new Error('This Website inquiry is already recorded.')
  return { ...ledger, revision: ledger.revision + 1, leads: [lead, ...ledger.leads] }
}

export function reviewWebsiteLead(
  ledgerValue: unknown,
  leadId: string,
  input: { status: Exclude<WebsiteLeadStatus, 'new'>; owner: string; decisionNote: string },
  nowValue: string,
) {
  const ledger = restoreWebsiteLeadLedger(ledgerValue)
  if (!ledger) throw new Error('The Website lead ledger is invalid.')
  const id = canonicalText(leadId, 'Lead ID', 80)
  const owner = canonicalText(input.owner, 'Lead owner', 120, 2)
  const decisionNote = canonicalOptionalText(input.decisionNote, 'Decision note', 500)
  const updatedAt = canonicalTimestamp(nowValue, 'Lead updated time')
  const index = ledger.leads.findIndex((lead) => lead.id === id)
  if (index < 0) throw new Error('The Website inquiry no longer exists.')
  const current = ledger.leads[index]
  if (current.status === 'closed') throw new Error('A closed Website inquiry cannot be changed.')
  if (input.status !== 'qualified' && input.status !== 'closed') throw new Error('Choose a supported Website inquiry decision.')
  const updated = canonicalLead({ ...current, status: input.status, owner, decisionNote, updatedAt })
  return {
    ...ledger,
    revision: ledger.revision + 1,
    leads: ledger.leads.map((lead, leadIndex) => leadIndex === index ? updated : lead),
  }
}

// A ledger IS one website's inbox: the device-local one lives beside the single local workspace
// under WEBSITE_LEAD_LEDGER_KEY, and the managed one lives inside that company workspace's
// leadLedger. Inbox membership therefore follows the ledger, never the site's display name.
//
// The inbox, the counts and the export all used to filter on `lead.siteName === workspace.siteName`
// instead. Renaming the site in Navigation is a one-field edit that an owner makes casually, and it
// silently emptied all three: every inquiry already captured stayed on disk but disappeared from
// the screen, from the "N new" badge that routes the owner to them, and from the export they would
// use to get their customers back. lead.siteName is kept, but only as the name the customer saw
// when they wrote in -- it is a label on the record, never a lookup key.
//
// The invariant that makes this safe is enforced upstream: activateLocalWebsiteWorkingSample and
// activateLocalWebsitePageDrafts both refuse to swap a different business into a workspace whose
// ledger holds inquiries, so a ledger never mixes two businesses.
export function websiteInboxLeads(ledger: WebsiteLeadLedger) {
  return ledger.leads
}

export function websiteLeadCounts(ledger: WebsiteLeadLedger) {
  const siteLeads = websiteInboxLeads(ledger)
  return {
    total: siteLeads.length,
    new: siteLeads.filter((lead) => lead.status === 'new').length,
    qualified: siteLeads.filter((lead) => lead.status === 'qualified').length,
    closed: siteLeads.filter((lead) => lead.status === 'closed').length,
  }
}
