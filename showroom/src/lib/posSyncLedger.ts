export type PosSyncLedgerStatus = 'queued' | 'synced' | 'failed'

export type PosSyncLedgerActionType =
  | 'staff.create'
  | 'staff.status'
  | 'staff.pin-rotate'
  | 'deployment.export'
  | 'deployment.copy'
  | 'invoice.print'
  | 'payment.manual'
  | 'hardware.test'
  | 'hardware.policy'
  | 'launch.certification'
  | 'launch.acceptance'
  | 'sales.handoff'
  | 'backup.export'
  | 'backup.restore'
  | 'backup.restore-report'
  | 'support.incident'
  | 'change.request'
  | 'help.quickstart'
  | 'help.support'
  | 'module.print'
  | 'module.action'

export type PosSyncLedgerEntry = {
  id: string
  actionType: PosSyncLedgerActionType
  status: PosSyncLedgerStatus
  summary: string
  createdAt: string
  attemptCount: number
  lastAttemptAt: string | null
  syncedAt: string | null
  failureReason: string | null
}

type PosSyncLedgerStore = {
  version: 1
  scopeKey: string
  entries: PosSyncLedgerEntry[]
}

const POS_SYNC_LEDGER_STORAGE_PREFIX = 'supermega.pos.sync.ledger.v1'

type EnqueueSyncLedgerInput = {
  actionType: PosSyncLedgerActionType
  summary: string
}

type FlushSyncLedgerResult = {
  entries: PosSyncLedgerEntry[]
  syncedCount: number
  queuedCount: number
  failedCount: number
}

type SyncLedgerSummary = {
  queued: number
  synced: number
  failed: number
  total: number
}

function normalizeScopeKey(scopeKey: string) {
  const raw = String(scopeKey || '').trim().toLowerCase()
  return raw || 'pos-default'
}

function getLedgerStorageKey(scopeKey: string) {
  return `${POS_SYNC_LEDGER_STORAGE_PREFIX}.${normalizeScopeKey(scopeKey)}`
}

function buildLedgerId() {
  const randomToken = Math.random().toString(36).slice(2, 10)
  return `sync-${Date.now()}-${randomToken}`
}

function sortEntries(entries: PosSyncLedgerEntry[]) {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function writeLedger(scopeKey: string, entries: PosSyncLedgerEntry[]) {
  if (typeof window === 'undefined') {
    return sortEntries(entries)
  }
  const nextEntries = sortEntries(entries)
  const payload: PosSyncLedgerStore = {
    version: 1,
    scopeKey: normalizeScopeKey(scopeKey),
    entries: nextEntries,
  }
  try {
    window.localStorage.setItem(getLedgerStorageKey(scopeKey), JSON.stringify(payload))
  } catch {
    return nextEntries
  }
  return nextEntries
}

function isEntry(value: unknown): value is PosSyncLedgerEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<PosSyncLedgerEntry>
  const status = record.status
  const actionType = record.actionType
  const validStatus = status === 'queued' || status === 'synced' || status === 'failed'
  const validAction =
    actionType === 'staff.create'
    || actionType === 'staff.status'
    || actionType === 'staff.pin-rotate'
    || actionType === 'deployment.export'
    || actionType === 'deployment.copy'
    || actionType === 'invoice.print'
    || actionType === 'payment.manual'
    || actionType === 'hardware.test'
    || actionType === 'hardware.policy'
    || actionType === 'launch.certification'
    || actionType === 'launch.acceptance'
    || actionType === 'sales.handoff'
    || actionType === 'backup.export'
    || actionType === 'backup.restore'
    || actionType === 'backup.restore-report'
    || actionType === 'support.incident'
    || actionType === 'change.request'
    || actionType === 'help.quickstart'
    || actionType === 'help.support'
    || actionType === 'module.print'
    || actionType === 'module.action'
  return Boolean(record.id && record.summary && record.createdAt && validStatus && validAction)
}

export function loadPosSyncLedger(scopeKey: string) {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(getLedgerStorageKey(scopeKey))
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as Partial<PosSyncLedgerStore>
    const entries = Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : []
    return sortEntries(entries)
  } catch {
    return []
  }
}

export function enqueuePosSyncLedgerEntry(scopeKey: string, input: EnqueueSyncLedgerInput) {
  const current = loadPosSyncLedger(scopeKey)
  const createdAt = new Date().toISOString()
  const nextEntry: PosSyncLedgerEntry = {
    id: buildLedgerId(),
    actionType: input.actionType,
    status: 'queued',
    summary: String(input.summary || '').trim() || 'Pending sync action',
    createdAt,
    attemptCount: 0,
    lastAttemptAt: null,
    syncedAt: null,
    failureReason: null,
  }
  return writeLedger(scopeKey, [nextEntry, ...current])
}

export function flushPosSyncLedger(scopeKey: string, isOnline: boolean): FlushSyncLedgerResult {
  const current = loadPosSyncLedger(scopeKey)
  if (!isOnline) {
    const summary = summarizePosSyncLedger(current)
    return {
      entries: current,
      syncedCount: summary.synced,
      queuedCount: summary.queued,
      failedCount: summary.failed,
    }
  }
  const now = new Date().toISOString()
  const nextEntries = current.map((entry) => {
    if (entry.status === 'synced') {
      return entry
    }
    if (!entry.summary.trim()) {
      return {
        ...entry,
        status: 'failed' as const,
        attemptCount: entry.attemptCount + 1,
        lastAttemptAt: now,
        failureReason: 'Empty summary.',
      }
    }
    return {
      ...entry,
      status: 'synced' as const,
      attemptCount: entry.attemptCount + 1,
      lastAttemptAt: now,
      syncedAt: now,
      failureReason: null,
    }
  })
  const persisted = writeLedger(scopeKey, nextEntries)
  const summary = summarizePosSyncLedger(persisted)
  return {
    entries: persisted,
    syncedCount: summary.synced,
    queuedCount: summary.queued,
    failedCount: summary.failed,
  }
}

export function clearPosSyncedLedger(scopeKey: string) {
  const current = loadPosSyncLedger(scopeKey)
  const next = current.filter((entry) => entry.status !== 'synced')
  return writeLedger(scopeKey, next)
}

export function summarizePosSyncLedger(entries: PosSyncLedgerEntry[]): SyncLedgerSummary {
  return entries.reduce(
    (summary, entry) => {
      summary.total += 1
      summary[entry.status] += 1
      return summary
    },
    { queued: 0, synced: 0, failed: 0, total: 0 },
  )
}
