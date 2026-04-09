import { downloadLeadCsv, type ActionRow, type LeadRow } from './tooling'

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
  actions: BrowserWorkspaceTask[]
}

const STORAGE_KEY = 'supermega.browser-workspace.v1'

export type BrowserWorkspaceTaskStatus = 'open' | 'done'

export type BrowserWorkspaceTask = {
  action_id: string
  title: string
  owner: string
  priority: ActionRow['priority']
  due: string
  status: BrowserWorkspaceTaskStatus
  source: 'manual' | 'lead'
  lead_id: string
  created_at: string
  updated_at: string
}

function isBrowser() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function safeReadStore(): BrowserWorkspaceStore {
  if (!isBrowser()) {
    return { leads: [], actions: [] }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { leads: [], actions: [] }
    }
    const parsed = JSON.parse(raw) as Partial<BrowserWorkspaceStore>
    return {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    }
  } catch {
    return { leads: [], actions: [] }
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
  const subject = `${row.name}: quick intro from SUPERMEGA.dev`
  const message = [
    `Hi ${row.name} team,`,
    '',
    `I found you while researching ${topic}.`,
    'SUPERMEGA.dev helps teams run follow-up, owners, and blockers in one workspace instead of scattered inboxes and sheets.',
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

export function listBrowserWorkspaceActions() {
  return safeReadStore().actions.sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'open' ? -1 : 1
    }
    return right.updated_at.localeCompare(left.updated_at)
  })
}

export function browserWorkspaceSummary(leads = listBrowserWorkspaceLeads()) {
  const actions = listBrowserWorkspaceActions()
  return {
    total: leads.length,
    newCount: leads.filter((lead) => lead.stage === 'new').length,
    outreachCount: leads.filter((lead) => lead.stage === 'outreach').length,
    contactedCount: leads.filter((lead) => lead.stage === 'contacted').length,
    qualifiedCount: leads.filter((lead) => lead.stage === 'qualified').length,
    actionCount: actions.length,
    openActionCount: actions.filter((action) => action.status === 'open').length,
  }
}

function buildActionId(title: string) {
  return `${slugify(title || 'action')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildLeadFollowUpAction(leadId: string, leadName: string): BrowserWorkspaceTask {
  const now = new Date().toISOString()
  return {
    action_id: buildActionId(`follow-up-${leadName}`),
    title: `Follow up ${leadName}`,
    owner: 'Sales',
    priority: 'High',
    due: 'Today',
    status: 'open',
    source: 'lead',
    lead_id: leadId,
    created_at: now,
    updated_at: now,
  }
}

export function saveBrowserWorkspaceLeads(rows: LeadRow[], context: { query: string; keywords: string[] }) {
  const store = safeReadStore()
  const existingByKey = new Map(store.leads.map((lead) => [buildLeadKey(lead), lead]))
  const actionLeadIds = new Set(store.actions.filter((action) => action.source === 'lead' && action.lead_id).map((action) => action.lead_id))
  let savedCount = 0
  let actionCount = 0

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
      if (!actionLeadIds.has(existing.lead_id)) {
        store.actions.push(buildLeadFollowUpAction(existing.lead_id, existing.name))
        actionLeadIds.add(existing.lead_id)
        actionCount += 1
      }
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
    if (!actionLeadIds.has(nextLead.lead_id)) {
      store.actions.push(buildLeadFollowUpAction(nextLead.lead_id, nextLead.name))
      actionLeadIds.add(nextLead.lead_id)
      actionCount += 1
    }
    savedCount += 1
  }

  safeWriteStore(store)
  return {
    savedCount,
    actionCount,
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
  store.actions = store.actions.filter((action) => action.lead_id !== leadId)
  safeWriteStore(store)
  return listBrowserWorkspaceLeads()
}

export function exportBrowserWorkspaceLeads() {
  downloadLeadCsv(listBrowserWorkspaceLeads())
}

export function saveBrowserWorkspaceActions(rows: Array<Pick<BrowserWorkspaceTask, 'title' | 'owner' | 'priority' | 'due'> & Partial<Pick<BrowserWorkspaceTask, 'source' | 'lead_id'>>>) {
  const store = safeReadStore()
  const now = new Date().toISOString()

  for (const row of rows) {
    if (!row.title.trim()) {
      continue
    }
    store.actions.push({
      action_id: buildActionId(row.title),
      title: row.title.trim(),
      owner: row.owner?.trim() || 'Owner',
      priority: row.priority,
      due: row.due?.trim() || 'This week',
      status: 'open',
      source: row.source || 'manual',
      lead_id: row.lead_id || '',
      created_at: now,
      updated_at: now,
    })
  }

  safeWriteStore(store)
  return listBrowserWorkspaceActions()
}

export function updateBrowserWorkspaceAction(actionId: string, updates: Partial<Pick<BrowserWorkspaceTask, 'status' | 'owner' | 'due' | 'title' | 'priority'>>) {
  const store = safeReadStore()
  store.actions = store.actions.map((action) =>
    action.action_id === actionId
      ? {
          ...action,
          ...updates,
          updated_at: new Date().toISOString(),
        }
      : action,
  )
  safeWriteStore(store)
  return listBrowserWorkspaceActions()
}

export function removeBrowserWorkspaceAction(actionId: string) {
  const store = safeReadStore()
  store.actions = store.actions.filter((action) => action.action_id !== actionId)
  safeWriteStore(store)
  return listBrowserWorkspaceActions()
}

export function seedBrowserWorkspaceActionsFromLeads() {
  const store = safeReadStore()
  const existingLeadIds = new Set(store.actions.filter((action) => action.lead_id).map((action) => action.lead_id))
  const rows = store.leads
    .filter((lead) => !existingLeadIds.has(lead.lead_id))
    .map((lead) => ({
      title: `Follow up ${lead.name}`,
      owner: 'Sales',
      priority: (lead.stage === 'qualified' ? 'Medium' : 'High') as ActionRow['priority'],
      due: lead.stage === 'qualified' ? 'This week' : 'Today',
      source: 'lead' as const,
      lead_id: lead.lead_id,
    }))

  return saveBrowserWorkspaceActions(rows)
}
