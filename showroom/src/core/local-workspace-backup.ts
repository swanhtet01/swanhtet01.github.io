import { isLocalWorkspaceKey, listLocalWorkspaceStorageKeys } from './local-workspace-storage.ts'
import { COMMERCE_KEY, COMMERCE_LOCK } from './commerce-workspace.ts'
import { PRODUCTION_KEY, PRODUCTION_LOCK } from './production-workspace.ts'

export { isLocalWorkspaceKey, listLocalWorkspaceStorageKeys }

// Same shape as commerce-workspace.ts / production-workspace.ts define locally for their own
// lockManager parameters. Restore must take the same locks those modules take around a
// read-modify-write, or a same-session restore can land mid-mutation and be silently overwritten
// or silently overwrite it.
type BackupLockManager = {
  request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T>
}

export const LOCAL_WORKSPACE_BACKUP_CONTRACT = 'supermega.local_workspace_backup.v1'
export const LOCAL_WORKSPACE_BACKUP_MAX_BYTES = 5 * 1024 * 1024
export const LOCAL_WORKSPACE_BACKUP_MAX_RECORDS = 256
export const LOCAL_WORKSPACE_RESTORE_POINT_KEY = 'supermega.local-workspace-restore-point.v1'

// WHY A REFUSAL HAS TO BE DESCRIBABLE.
//
// collectLocalWorkspaceBackup returns null for two quite different reasons -- the workspace
// is over LOCAL_WORKSPACE_BACKUP_MAX_BYTES, or it holds more than
// LOCAL_WORKSPACE_BACKUP_MAX_RECORDS keys -- and until this existed the settings page could
// only tell the two apart by not trying. It rendered a disabled button reading "Backup
// unavailable" and said nothing else.
//
// That is the failure mode this product already found in its sister POS: the owner is told
// to take a backup by the storage meter, walks to Settings, and finds a dead control with no
// reason and no next step. It fails at exactly the moment it matters, and it fails silently.
//
// Measured 2026-08-21 by driving the real transitions: a Shop workspace at its enforced
// 2 MiB ceiling (1,190 completed sales) serialises into the backup envelope at about 1.12x
// because every record is JSON escaped inside a JSON string. That leaves roughly 2.6 MB for
// every other product on the device, and Plant costs about 2,085 bytes per job -- so a shop
// at its own ceiling that also runs Plant crosses the backup cap at somewhere near 1,200
// Plant jobs. Plant has no byte ceiling and no headroom meter of its own, so nothing warns
// her on the way there. This type is what lets the page say so.
export type LocalWorkspaceBackupRefusal = {
  reason: 'too_large' | 'too_many_records'
  bytes: number
  maxBytes: number
  records: number
  maxRecords: number
}

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
  if (entries.length > LOCAL_WORKSPACE_BACKUP_MAX_RECORDS) return null
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

function candidateBackup(storage: StorageReader, createdAt: string) {
  const records: Record<string, string> = {}
  for (const key of listLocalWorkspaceStorageKeys(storage)) {
    const value = storage.getItem(key)
    if (value !== null) records[key] = value
  }
  return { contract: LOCAL_WORKSPACE_BACKUP_CONTRACT, version: 1 as const, createdAt, records }
}

export function collectLocalWorkspaceBackup(storage: StorageReader, createdAt = new Date().toISOString()) {
  return checkedBackup(candidateBackup(storage, createdAt))
}

/**
 * Why this device cannot produce a backup, or null when it can.
 *
 * Deliberately built from the SAME candidate envelope collectLocalWorkspaceBackup weighs,
 * so the reason the owner is shown can never disagree with the decision that was made. The
 * weighing is the serialisation itself -- there is no cheaper proxy for it, because the
 * escaping of each record inside the envelope is most of what pushes a device over.
 */
export function describeLocalWorkspaceBackupRefusal(
  storage: StorageReader,
  createdAt = new Date().toISOString(),
): LocalWorkspaceBackupRefusal | null {
  const candidate = candidateBackup(storage, createdAt)
  const records = Object.keys(candidate.records).length
  const bytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength
  if (checkedBackup(candidate)) return null
  return {
    reason: records > LOCAL_WORKSPACE_BACKUP_MAX_RECORDS ? 'too_many_records' : 'too_large',
    bytes,
    maxBytes: LOCAL_WORKSPACE_BACKUP_MAX_BYTES,
    records,
    maxRecords: LOCAL_WORKSPACE_BACKUP_MAX_RECORDS,
  }
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

/**
 * The sentence an owner reads when this device cannot produce a backup file.
 *
 * It has to do three things the disabled "Backup unavailable" button did not. Say that
 * nothing has been lost, because the first thing a person fears on reading that a backup
 * failed is that the records are already gone. Say WHY, in the same MB units as the storage
 * meter that sent her to this page, so the two readings can be checked against each other.
 * And give her the one action still open to her.
 *
 * The last clause is the one that matters most. "Reset this device" takes a restore point
 * first, and a restore point is this same refusal -- so an owner who cannot make a backup
 * also has no safety net under the destructive control sitting further down the same page.
 * Saying so here is the difference between a warning and a trap.
 */
export function localWorkspaceBackupRefusalMessage(refusal: LocalWorkspaceBackupRefusal) {
  // `bytes` is the size of the FILE these records would make, not the size of the records
  // themselves -- escaping them inside the envelope adds about 12%. Saying "this device holds
  // 5.74 MB" would be wrong by that margin, and would not match any figure she can see
  // anywhere else in the product.
  const cause = refusal.reason === 'too_many_records'
    ? `It holds ${refusal.records.toLocaleString()} separate records and a backup file can carry ${refusal.maxRecords.toLocaleString()}.`
    : `Its records would need a ${(refusal.bytes / 1048576).toFixed(2)} MB file and a backup file can carry ${(refusal.maxBytes / 1048576).toFixed(2)} MB.`
  return `This device cannot be backed up to a file. ${cause} Nothing has been lost and your records are still on this device, but there is no file that can put this device back the way it is now. Keep a readable copy of your sales with Download sales archive below, and do not reset this device until a backup succeeds.`
}

function lockNameForWorkspaceKey(key: string): string | null {
  if (key === COMMERCE_KEY) return COMMERCE_LOCK
  if (key === PRODUCTION_KEY) return PRODUCTION_LOCK
  return null
}

async function withWorkspaceLock<T>(key: string, lockManager: BackupLockManager | undefined, run: () => T): Promise<T> {
  const lockName = lockNameForWorkspaceKey(key)
  if (lockName && lockManager?.request) return lockManager.request(lockName, { mode: 'exclusive' }, run)
  return run()
}

async function removeLocalWorkspaceRecords(storage: StorageWriter, lockManager: BackupLockManager | undefined) {
  for (const key of listLocalWorkspaceStorageKeys(storage)) {
    await withWorkspaceLock(key, lockManager, () => storage.removeItem(key))
  }
}

export async function applyLocalWorkspaceBackup(
  storage: StorageWriter,
  value: LocalWorkspaceBackup,
  lockManager = globalThis.navigator?.locks as unknown as BackupLockManager | undefined,
) {
  const backup = checkedBackup(value)
  const previous = collectLocalWorkspaceBackup(storage)
  if (!backup || !previous) throw new Error('The local workspace backup is invalid or too large.')
  try {
    await removeLocalWorkspaceRecords(storage, lockManager)
    const entries = Object.entries(backup.records).sort(([left], [right]) => left.localeCompare(right))
    for (const [key, raw] of entries) {
      await withWorkspaceLock(key, lockManager, () => storage.setItem(key, raw))
    }
  } catch (error) {
    try {
      await removeLocalWorkspaceRecords(storage, lockManager)
      for (const [key, raw] of Object.entries(previous.records)) {
        await withWorkspaceLock(key, lockManager, () => storage.setItem(key, raw))
      }
    } catch { /* Preserve the original failure. */ }
    throw error
  }
}
