import { isLocalWorkspaceKey, listLocalWorkspaceStorageKeys } from './local-workspace-storage.ts'

export { isLocalWorkspaceKey, listLocalWorkspaceStorageKeys }

export const LOCAL_WORKSPACE_BACKUP_CONTRACT = 'supermega.local_workspace_backup.v1'
export const LOCAL_WORKSPACE_BACKUP_MAX_BYTES = 5 * 1024 * 1024
export const LOCAL_WORKSPACE_RESTORE_POINT_KEY = 'supermega.local-workspace-restore-point.v1'

export type LocalWorkspaceBackup = {
  contract: typeof LOCAL_WORKSPACE_BACKUP_CONTRACT
  version: 1
  createdAt: string
  records: Record<string, string>
}

type StorageReader = Pick<Storage, 'getItem' | 'key' | 'length'>
type StorageWriter = StorageReader & Pick<Storage, 'removeItem' | 'setItem'>

function checkedBackup(value: unknown): LocalWorkspaceBackup | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<LocalWorkspaceBackup>
  if (source.contract !== LOCAL_WORKSPACE_BACKUP_CONTRACT
    || source.version !== 1
    || typeof source.createdAt !== 'string'
    || !Number.isFinite(Date.parse(source.createdAt))
    || !source.records
    || typeof source.records !== 'object'
    || Array.isArray(source.records)) return null
  const entries = Object.entries(source.records)
  if (entries.length > 256) return null
  const records: Record<string, string> = {}
  for (const [key, raw] of entries) {
    if (!key || key.length > 240 || !isLocalWorkspaceKey(key) || typeof raw !== 'string') return null
    records[key] = raw
  }
  const backup: LocalWorkspaceBackup = {
    contract: LOCAL_WORKSPACE_BACKUP_CONTRACT,
    version: 1,
    createdAt: source.createdAt,
    records,
  }
  return new TextEncoder().encode(JSON.stringify(backup)).byteLength <= LOCAL_WORKSPACE_BACKUP_MAX_BYTES ? backup : null
}

export function collectLocalWorkspaceBackup(storage: StorageReader, createdAt = new Date().toISOString()) {
  const records: Record<string, string> = {}
  for (const key of listLocalWorkspaceStorageKeys(storage)) {
    const value = storage.getItem(key)
    if (value !== null) records[key] = value
  }
  return checkedBackup({ contract: LOCAL_WORKSPACE_BACKUP_CONTRACT, version: 1, createdAt, records })
}

export function restoreLocalWorkspaceBackup(value: unknown) {
  return checkedBackup(value)
}

export function restoreLocalWorkspaceBackupFromEvidence(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const evidence = value as { contract?: unknown; version?: unknown; environment?: unknown; localWorkspaceBackup?: unknown }
  if (evidence.contract !== 'supermega_trial_evidence'
    || evidence.version !== 24
    || evidence.environment !== 'isolated_demo') return null
  return checkedBackup(evidence.localWorkspaceBackup)
}

function removeLocalWorkspaceRecords(storage: StorageWriter) {
  listLocalWorkspaceStorageKeys(storage).forEach((key) => storage.removeItem(key))
}

export function applyLocalWorkspaceBackup(storage: StorageWriter, value: LocalWorkspaceBackup) {
  const backup = checkedBackup(value)
  const previous = collectLocalWorkspaceBackup(storage)
  if (!backup || !previous) throw new Error('The local workspace backup is invalid or too large.')
  try {
    removeLocalWorkspaceRecords(storage)
    Object.entries(backup.records).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, raw]) => storage.setItem(key, raw))
  } catch (error) {
    try {
      removeLocalWorkspaceRecords(storage)
      Object.entries(previous.records).forEach(([key, raw]) => storage.setItem(key, raw))
    } catch { /* Preserve the original failure. */ }
    throw error
  }
}
