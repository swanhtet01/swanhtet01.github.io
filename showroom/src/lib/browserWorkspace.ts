import { downloadLeadCsv, type LeadRow } from './tooling'

export type BrowserWorkspaceStage = 'new' | 'outreach' | 'contacted' | 'qualified'

export type BrowserWorkspaceLead = LeadRow & {
  lead_id: string
  query: string
  keywords: string[]
  stage: BrowserWorkspaceStage
  notes: string
  outreach_subject: string
  outreach_message: string
  created_at: string
  updated_at: string
}

type BrowserWorkspaceStore = {
  leads: BrowserWorkspaceLead[]
}

const STORAGE_KEY = 'supermega.browser-workspace.v1'

function isBrowser() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function safeReadStore(): BrowserWorkspaceStore {
  if (!isBrowser()) {
    return { leads: [] }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { leads: [] }
    }
    const parsed = JSON.parse(raw) as Partial<BrowserWorkspaceStore>
    return {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
    }
  } catch {
    return { leads: [] }
  }
}

function safeWriteStore(store: BrowserWorkspaceStore) {
  if (!isBrowser()) {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function buildLeadKey(row: LeadRow) {
  return [row.name, row.website, row.phone, row.email, row.source_url]
    .filter(Boolean)
    .join('|')
    .trim()
    .toLowerCase()
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function buildBrowserOutreach(row: LeadRow, query: string, keywords: string[]) {
  const topic = query.trim() || keywords.join(', ') || 'your workflow'
  const subject = `${row.name}: quick intro from SuperMega`
  const message = [
    `Hi ${row.name} team,`,
    '',
    `I found you while researching ${topic}.`,
    'SuperMega helps teams run follow-up, owners, and blockers in one workspace instead of scattered inboxes and sheets.',
    '',
    'Would a short call next week be useful?',
  ].join('\n')

  return {
    subject,
    message,
  }
}

export function listBrowserWorkspaceLeads() {
  return safeReadStore().leads.sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export function browserWorkspaceSummary(leads = listBrowserWorkspaceLeads()) {
  return {
    total: leads.length,
    newCount: leads.filter((lead) => lead.stage === 'new').length,
    outreachCount: leads.filter((lead) => lead.stage === 'outreach').length,
    contactedCount: leads.filter((lead) => lead.stage === 'contacted').length,
    qualifiedCount: leads.filter((lead) => lead.stage === 'qualified').length,
  }
}

export function saveBrowserWorkspaceLeads(rows: LeadRow[], context: { query: string; keywords: string[] }) {
  const store = safeReadStore()
  const existingByKey = new Map(store.leads.map((lead) => [buildLeadKey(lead), lead]))
  let savedCount = 0

  for (const row of rows) {
    const key = buildLeadKey(row)
    if (!key) {
      continue
    }

    const now = new Date().toISOString()
    const outreach = buildBrowserOutreach(row, context.query, context.keywords)
    const existing = existingByKey.get(key)

    if (existing) {
      existing.updated_at = now
      existing.query = context.query
      existing.keywords = context.keywords
      existing.outreach_subject = existing.outreach_subject || outreach.subject
      existing.outreach_message = existing.outreach_message || outreach.message
      existing.score = Math.max(existing.score, row.score)
      existing.phone = existing.phone || row.phone
      existing.email = existing.email || row.email
      existing.website = existing.website || row.website
      existing.source_url = existing.source_url || row.source_url
      savedCount += 1
      continue
    }

    const nextLead: BrowserWorkspaceLead = {
      ...row,
      lead_id: `${slugify(row.name || 'lead')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      query: context.query,
      keywords: context.keywords,
      stage: 'new',
      notes: '',
      outreach_subject: outreach.subject,
      outreach_message: outreach.message,
      created_at: now,
      updated_at: now,
    }
    store.leads.push(nextLead)
    existingByKey.set(key, nextLead)
    savedCount += 1
  }

  safeWriteStore(store)
  return {
    savedCount,
    totalCount: store.leads.length,
    rows: listBrowserWorkspaceLeads(),
  }
}

export function updateBrowserWorkspaceLead(leadId: string, updates: Partial<Pick<BrowserWorkspaceLead, 'stage' | 'notes'>>) {
  const store = safeReadStore()
  store.leads = store.leads.map((lead) =>
    lead.lead_id === leadId
      ? {
          ...lead,
          ...updates,
          updated_at: new Date().toISOString(),
        }
      : lead,
  )
  safeWriteStore(store)
  return listBrowserWorkspaceLeads()
}

export function removeBrowserWorkspaceLead(leadId: string) {
  const store = safeReadStore()
  store.leads = store.leads.filter((lead) => lead.lead_id !== leadId)
  safeWriteStore(store)
  return listBrowserWorkspaceLeads()
}

export function exportBrowserWorkspaceLeads() {
  downloadLeadCsv(listBrowserWorkspaceLeads())
}

