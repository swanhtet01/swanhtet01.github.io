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
// 2 MiB ceiling (1,190 completed sales) serialises into the backup envelope at about 1.12x,
// because every record is JSON escaped inside a JSON string. Shop alone therefore spends
// 50.3% of this cap, leaving roughly 2.47 MB for every other product on the device. Plant
// costs about 2,085 bytes per job with its shift output records, so a shop at her own
// ceiling who also runs Plant loses the ability to back up at 1,183 Plant jobs -- bisected
// to the byte, 2,468,949 backs up and 2,468,950 does not.
//
// Plant has no byte ceiling anywhere in this codebase and no headroom meter of its own, so
// nothing warns her on the way there. Until the design gap behind that is closed, the least
// this page owes her is a reason. This type is what lets it give one.
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

// ---------------------------------------------------------------------------
// Backup headroom -- how much room is left before this DEVICE loses its backup.
//
// WHY A SECOND METER IS NOT WHAT THIS IS. storage-durability.ts already meters SHOP against
// Shop's own two ceilings and says the answer in sales, in the till. That meter is about
// whether the till can keep SELLING. This one is about whether the device can still be
// COPIED OFF, which is a different question with a different ceiling, a different remedy,
// and a different audience -- and the two are deliberately kept on different screens so an
// owner is never asked to reconcile two storage readings at once. The Shop meter lives in
// the till; this one lives beside Download workspace backup, because a backup is the only
// thing an owner can actually DO about a device-wide limit.
//
// WHY IT IS MEASURED FROM THE BACKUP AND NOT FROM STORAGE. The argument is the
// LocalWorkspaceBackup that collectLocalWorkspaceBackup already returned, not the Storage it
// was read from. Three things follow, and all three are the point:
//  - The figure shown can never disagree with the file the button will download, because it
//    describes THAT envelope and no other. There is no second reading of localStorage that
//    could have moved in between.
//  - A device that CANNOT produce a backup has no headroom to report -- it has a refusal,
//    which describeLocalWorkspaceBackupRefusal already words. The two states are mutually
//    exclusive by construction, so the page can never show a warning and a refusal at once.
//  - It costs no second serialisation and no second storage read. See the cost note on
//    measureLocalWorkspaceBackupHeadroom for what it does cost.
//
// WHY NO CEILING IS BEING ADDED TO ANY PRODUCT. Shop's write ceiling is only safe because it
// has always existed and because it weighs the CANDIDATE state, never the base -- so a
// workspace already over the line can still write a change that brings it back under. A new
// ceiling applied to Plant workspaces that are already above it would freeze them: no
// further writes and no way back. This file therefore adds visibility and nothing else. It
// reads; it refuses nothing that was not already refused.

// The two ratios the Shop meter chose, kept deliberately rather than re-derived, so a device
// has ONE pair of thresholds and one mental model instead of two.
//
// The timing argument is different here, and weaker, which is why consistency wins. Shop can
// reason in trading days because it knows its own cost per sale. This ceiling is shared by
// every product on the device and no growth rate is known for it, so "how long is left"
// cannot be answered honestly at all -- at 90% of the file a plant recording two jobs a
// working day still has months, and one recording twenty has a fortnight.
//
// What makes an early notice affordable here is WHERE it renders. The Shop meter interrupts a
// till, so speaking too early trains an owner to dismiss it. This renders on a settings page
// she opened on purpose, next to the button it is about, and only while she is already
// thinking about backups -- so the cost of being early is close to nothing, and the cost of
// being late is a device that can never be copied off again. Tone still escalates rather than
// only colour, exactly as the Shop meter does: 'tight' is a quiet notice, 'urgent' is an alert.
export const LOCAL_WORKSPACE_BACKUP_TIGHT_RATIO = 0.7
export const LOCAL_WORKSPACE_BACKUP_URGENT_RATIO = 0.9

export type LocalWorkspaceBackupHeadroomLevel = 'clear' | 'tight' | 'urgent'
export type LocalWorkspaceBackupHeadroomLimit = 'bytes' | 'records'

export type LocalWorkspaceBackupProductShare = {
  // The owner-facing product name, or null for records no product owns (setup, approvals,
  // the accountable-action log). Never a storage key: an owner has never seen one.
  product: string | null
  bytes: number
  records: number
}

export type LocalWorkspaceBackupHeadroom = {
  // 'clear' is the silent state. Callers must render nothing for it.
  level: LocalWorkspaceBackupHeadroomLevel
  // Which of the file's TWO ceilings this device will reach first. Same discipline as the
  // Shop meter: a device can be comfortable on size while its record COUNT is nearly full,
  // and a gauge reading only size would reassure exactly the device in most danger.
  limit: LocalWorkspaceBackupHeadroomLimit
  // 0..1 against `limit`, the ratio `level` was decided from.
  usedRatio: number
  bytes: number
  maxBytes: number
  records: number
  maxRecords: number
  // Per product, largest first, so the page can say WHAT is filling the file. An owner told
  // only that a device is filling up cannot tell whether the growth is hers to slow down.
  shares: readonly LocalWorkspaceBackupProductShare[]
  // The product holding a strict MAJORITY of whatever `limit` measures, or null when no
  // single product does. Null is the honest answer, not a fallback to the biggest share:
  // "most of it is Plant" is false at 40%.
  dominant: string | null
}

// Storage keys carry version suffixes and scope suffixes an owner has never seen. Ordered so
// the longer match wins where two could apply: 'supermega.website-ecommerce-handoff.v1' is
// Website, not Ecommerce.
const backupProductPrefixes: ReadonlyArray<readonly [string, string]> = [
  ['supermega.commerce.', 'Shop'],
  ['supermega.shop.', 'Shop'],
  ['supermega.production.', 'Plant'],
  ['supermega.plant.', 'Plant'],
  ['supermega.website', 'Website'],
  ['supermega.ecommerce.', 'Ecommerce'],
  ['supermega.team.', 'Team'],
]

function backupProductForKey(key: string): string | null {
  for (const [prefix, product] of backupProductPrefixes) {
    if (key.startsWith(prefix)) return product
  }
  return null
}

/**
 * The byte length JSON.stringify would give this string, without building it.
 *
 * The whole reason this exists rather than a JSON.stringify + TextEncoder pair: the records
 * on a loaded device run to megabytes, and stringifying them again would allocate a second
 * copy of every one of them on a cheap tablet that is, by hypothesis, already short of room.
 * This walks each record once and allocates nothing.
 *
 * It has to agree with JSON.stringify EXACTLY, not approximately, because the total it feeds
 * is compared against the same cap the download button is gated on -- a figure that drifted
 * from that cap would put a green meter in front of a device that cannot back up. The
 * agreement is proven byte for byte against JSON.stringify in tools/storage_durability.test.mjs,
 * including the lone-surrogate case, which is the one an eyeballed implementation gets wrong.
 */
function jsonStringByteLength(text: string): number {
  let bytes = 2
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code === 0x22 || code === 0x5c) bytes += 2
    else if (code < 0x20) bytes += code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6
    else if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0
      // A well-formed pair is one 4-byte character; a lone high surrogate is escaped as
      // \uD800 by well-formed JSON.stringify, which is six bytes and not three.
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index += 1 } else bytes += 6
    } else if (code >= 0xdc00 && code <= 0xdfff) bytes += 6
    else bytes += 3
  }
  return bytes
}

/**
 * How close this device is to being unable to produce a backup file, or 'clear' when it is
 * nowhere near.
 *
 * COST, honestly. This is not cheap in absolute terms and the comment should not pretend it
 * is. Two fixtures, both on a development desktop, both re-measured AFTER #535 moved the
 * download off the mount path -- a figure quoted against a mount that no longer exists is how
 * this repo carried a false contrast ratio for weeks.
 *
 *   Shop alone at its 2 MiB write ceiling, a 2,341,700-byte backup file:
 *     collectLocalWorkspaceBackup    7.4 ms   (on mount, unchanged by #535)
 *     this function                  6.7 ms   (on mount, added here)
 *   The largest device that can produce a backup at ALL -- that Shop plus the Plant record
 *   one byte under the wall, a 5,242,880-byte file:
 *     collectLocalWorkspaceBackup   15.8 ms
 *     this function                 13.1 ms
 *
 * So it roughly doubles the one call it rides on, at the single worst device this product can
 * hold; a shop with a few hundred sales pays a small fraction of that, because the work is
 * linear in what is stored.
 *
 * In MOUNT terms it is still a large net win, because #535 removed far more than this adds.
 * On the heavier fixture the settings page cost 50.5 ms to open before #535 -- that same
 * collect plus the 34.7 ms data: URL it built whether or not Download was ever pressed --
 * 15.8 ms after it, and 28.9 ms with this meter on top. That is 43% cheaper to open than
 * before either change. This is not a licence to spend the difference; it is why spending
 * this much of it is defensible.
 *
 * What makes it acceptable is WHEN it is paid: once per visit to the settings page, in a
 * useMemo at mount. Never per render, never per sale, never on the till's path, and never on
 * first paint of any product. It is the same trade the Shop meter made -- one weighing per
 * event that could have changed the answer -- moved to the event that matters here, which is
 * an owner opening the page the backup button lives on.
 *
 * The single pass is also the reason it is written this way rather than as
 * TextEncoder().encode(JSON.stringify(backup)). Measured against the heavier fixture that
 * alternative costs about 18 ms, gives no per-product breakdown, and allocates a second
 * five-megabyte string plus a five-megabyte byte array on a device that is by hypothesis
 * short of room. Summing JSON.stringify per record costs the same 18 ms with the same
 * allocations. Walking each record once is both the cheapest of the three and the only one
 * that can say which product is filling the file.
 *
 * It is NOT cached, deliberately. A cache would key on the backup object, which is rebuilt on
 * every mount anyway, so it would cost a module-scoped slot to save nothing.
 */
export function measureLocalWorkspaceBackupHeadroom(backup: LocalWorkspaceBackup): LocalWorkspaceBackupHeadroom {
  const entries = Object.entries(backup.records)
  // The fixed part of the envelope -- contract, version, createdAt, and the empty records
  // object -- taken from the real serialiser rather than assumed, so a change to the backup
  // shape cannot leave this measuring a document that no longer exists. The separators
  // between entries are the only part counted by hand.
  const envelope: LocalWorkspaceBackup = { ...backup, records: {} }
  let bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength + Math.max(0, entries.length - 1)
  const tally = new Map<string | null, { bytes: number; records: number }>()
  for (const [key, value] of entries) {
    const entryBytes = jsonStringByteLength(key) + 1 + jsonStringByteLength(value)
    bytes += entryBytes
    const product = backupProductForKey(key)
    const current = tally.get(product) ?? { bytes: 0, records: 0 }
    current.bytes += entryBytes
    current.records += 1
    tally.set(product, current)
  }

  const records = entries.length
  const byteRatio = bytes / LOCAL_WORKSPACE_BACKUP_MAX_BYTES
  const recordRatio = records / LOCAL_WORKSPACE_BACKUP_MAX_RECORDS
  // Whichever ceiling this device reaches first. Ties go to bytes, which is the one that
  // binds first on every device measured so far.
  const limit: LocalWorkspaceBackupHeadroomLimit = recordRatio > byteRatio ? 'records' : 'bytes'
  const usedRatio = limit === 'records' ? recordRatio : byteRatio

  const shares = [...tally.entries()]
    .map(([product, totals]) => ({ product, bytes: totals.bytes, records: totals.records }))
    .sort((left, right) => right.bytes - left.bytes)
  const measureOf = (share: LocalWorkspaceBackupProductShare) => (limit === 'records' ? share.records : share.bytes)
  const total = limit === 'records' ? records : shares.reduce((sum, share) => sum + share.bytes, 0)
  const leader = shares.find((share) => share.product !== null && measureOf(share) * 2 > total)

  return {
    level: usedRatio >= LOCAL_WORKSPACE_BACKUP_URGENT_RATIO
      ? 'urgent'
      : usedRatio >= LOCAL_WORKSPACE_BACKUP_TIGHT_RATIO ? 'tight' : 'clear',
    limit,
    usedRatio,
    bytes,
    maxBytes: LOCAL_WORKSPACE_BACKUP_MAX_BYTES,
    records,
    maxRecords: LOCAL_WORKSPACE_BACKUP_MAX_RECORDS,
    shares,
    dominant: leader?.product ?? null,
  }
}

/** The words on the pill. Escalation is in tone, not only in colour. */
export function localWorkspaceBackupHeadroomLabel(headroom: LocalWorkspaceBackupHeadroom) {
  return headroom.level === 'urgent' ? 'Backup room almost gone' : 'Backup room filling up'
}

/**
 * What an owner reads BEFORE the wall, standing at the button that is about to stop working.
 *
 * It states the size in the same MB units localWorkspaceBackupRefusalMessage uses, and for
 * the same reason: these two sentences are the before and after of one event, and an owner
 * who saw "4.82 MB" last month has to recognise "would need a 5.06 MB file" as the same
 * measure arriving. That is also why this does not speak in sales or in jobs. The Shop meter
 * can count sales because Shop's ceiling is Shop's alone; this ceiling is shared, and on a
 * two-product device the room is as often eaten by the product the owner is not looking at.
 * "About 400 more jobs" would be a confident lie on the day Shop grows instead.
 *
 * The product sentence is spoken only when one product holds a strict majority, because
 * "most of it is Plant" is untrue at 40% and an owner has no way to check it.
 *
 * The advice stops at taking a backup. A compaction pass that would reclaim room is DESIGNED
 * but NOT APPROVED -- it rewrites a shop's own business records and sits behind a founder
 * gate -- so nothing here may hint that room can be recovered. What is true today is that it
 * cannot be, and that is what this says.
 */
export function localWorkspaceBackupHeadroomMessage(headroom: LocalWorkspaceBackupHeadroom) {
  const size = headroom.limit === 'records'
    ? `This device holds ${headroom.records.toLocaleString()} separate records, and a backup file can carry ${headroom.maxRecords.toLocaleString()}.`
    : `A backup file of this device would be ${(headroom.bytes / 1048576).toFixed(2)} MB, and a backup file can carry ${(headroom.maxBytes / 1048576).toFixed(2)} MB.`
  const cause = headroom.dominant
    ? headroom.limit === 'records'
      ? ` Most of them are ${headroom.dominant} records.`
      : ` Most of it is ${headroom.dominant} records.`
    : ''
  const past = headroom.limit === 'records'
    ? `${headroom.maxRecords.toLocaleString()} records`
    : `${(headroom.maxBytes / 1048576).toFixed(2)} MB`
  const advice = headroom.level === 'urgent'
    ? ` Download a workspace backup now, while one can still be made. Past ${past} no backup file can be made at all, there is no way to free up room inside SuperMega yet, and Reset this device would have no restore point to fall back on.`
    : ' Download a workspace backup now and keep taking one regularly, because there is no way to free up room inside SuperMega yet.'
  return `${size}${cause}${advice}`
}

/**
 * The accounting line under the sentence, in the same shape the Shop meter's detail uses.
 *
 * Three products at most, and never one that rounds to 0.00 MB. A product listed at 0.00 MB
 * reads as a bug or as a rounding lie -- it is neither, it is Website holding three kilobytes
 * -- and either reading costs the line the credibility it is there to provide.
 */
export function localWorkspaceBackupHeadroomDetail(headroom: LocalWorkspaceBackupHeadroom) {
  if (headroom.limit === 'records') {
    const named = headroom.shares.filter((share) => share.product !== null).slice(0, 3)
    const parts = named.map((share) => `${share.product} ${share.records.toLocaleString()}`)
    return [`${headroom.records.toLocaleString()} of ${headroom.maxRecords.toLocaleString()} records used`, ...parts].join(' · ')
  }
  const parts = headroom.shares
    .filter((share) => share.product !== null && share.bytes >= 0.005 * 1048576)
    .slice(0, 3)
    .map((share) => `${share.product} ${(share.bytes / 1048576).toFixed(2)} MB`)
  return [`${(headroom.bytes / 1048576).toFixed(2)} MB of ${(headroom.maxBytes / 1048576).toFixed(2)} MB used`, ...parts].join(' · ')
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
