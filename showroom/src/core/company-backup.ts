import { isLocalWorkspaceKey } from './local-workspace-storage.ts'
import { COMMERCE_KEY, COMMERCE_LOCK } from './commerce-workspace.ts'
import { PRODUCTION_KEY, PRODUCTION_LOCK } from './production-workspace.ts'

// Same shape as commerce-workspace.ts / production-workspace.ts define locally for their own
// lockManager parameters. Restore must take the same locks those modules take around a
// read-modify-write, or a same-session restore can land mid-mutation and be silently overwritten
// or silently overwrite it.
type BackupLockManager = {
  request: <T>(name: string, options: { mode: 'exclusive' }, callback: () => T | Promise<T>) => Promise<T>
}

export const COMPANY_BACKUP_CONTRACT = 'supermega.company_backup.v1'
export const COMPANY_SNAPSHOT_CONTRACT = 'supermega.local_company_snapshot.v1'
export const COMPANY_BACKUP_KDF_ITERATIONS = 600_000

export const COMPANY_BACKUP_MAX_FILE_BYTES = 17 * 1024 * 1024
const MAX_BACKUP_BYTES = COMPANY_BACKUP_MAX_FILE_BYTES
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024
const MAX_CIPHERTEXT_BYTES = MAX_SNAPSHOT_BYTES + 16
const MAX_RECORD_BYTES = 4 * 1024 * 1024
const MAX_RECORDS = 512
const MAX_STORAGE_KEYS = 4096
const MIN_PASSPHRASE_LENGTH = 12
const MAX_PASSPHRASE_LENGTH = 256

const portableExactKeys = new Set([
  'supermega.commerce.workspace.v2',
  'supermega.production.workspace.v2',
  'supermega.website.workspace.v2',
  'supermega.website-ecommerce-handoff.v1',
  'supermega.setup.v3',
  'supermega.product_setups.v1',
  'supermega.approvals.v3',
  'supermega.accountable.actions.v1',
  'supermega.behavior-trail.v1',
  'supermega.team.workspace.v4',
  'supermega.pilot-outcome.v1',
  'supermega.owner-control-acknowledgements.v1',
  // Added after a probe restored a backup onto the SAME device and destroyed four of six records.
  // restoreCompanyBackup nulls every resettable key the snapshot did not carry, so "not portable"
  // silently means "deleted on restore". These are a business's actual records, not scaffolding:
  // the appointment book IS the product for a spa, a salon or a clinic, and website leads are
  // customers who asked to be contacted. Losing either to a restore is unrecoverable.
  'supermega.shop.service-schedule.v1',
  'supermega.website.leads.v1',
  'supermega.plant.industry-pack.v1',
  'supermega.trial_signup.v1',
  'supermega.last_operator.v1',
  // The in-progress basket. 'supermega.shop.order_draft.v1.' is already a portable PREFIX, so
  // leaving the counter draft behind was an inconsistency rather than a decision.
  'supermega.shop.counter_draft.v1',
  // Append-only local Batch Profit Control reviews are business records. A restore that omitted
  // them would erase the owner's reviewed production-cost and batch-disposition lineage.
  'supermega.shop.batch-profit-control.local-workspace.v1',
  // Order-intake correction evidence. Portable, unlike the local analytics counters below, because
  // it is an accumulating record of how the AI performs on THIS shop's own messages rather than a
  // marker about this device — the same reasoning that makes the behaviour trail portable. It is
  // also the asset: a shop that replaces a device would otherwise silently lose every correction it
  // has ever taught the system. Carrying it is safe because the record is digest-only, so the
  // backup file gains no message text it did not already lack.
  'supermega.shop.order-intake-evidence.v1',
])

/**
 * Resettable but deliberately NOT portable, each for a stated reason. Restore clears these on
 * purpose: they are superseded keys whose stale contents would override the records being restored,
 * or local scaffolding with no business meaning.
 *
 * This list exists so the decision is explicit. test_backup_covers_business_data.mjs fails when a
 * key is resettable, not portable, and not named here -- which is the exact shape of the bug this
 * comment is standing on. A new key now forces a choice instead of defaulting to deletion.
 */
export const deliberatelyNotPortableKeys: readonly string[] = [
  // Superseded by the .v3/.v4/.v2 keys above; migration reads them, restore must not resurrect them.
  'supermega.approvals.v2',
  'supermega.setup.v2',
  'supermega.commerce.workspace.v1',
  'supermega.shop.workspace.v2',
  'supermega.production.workspace.v1',
  'supermega.plant.workspace.v2',
  'supermega.website.workspace.v1',
  'supermega.ecommerce.storefront_draft.v1',
  'supermega.team.workspace.v2',
  'supermega.team.workspace.v3',
  // Reset epochs and demo scaffolding: markers about THIS device, meaningless on another.
  'supermega.shop.order_draft_reset.v1',
  'supermega.ecommerce.storefront_draft_reset.v1',
  'supermega.client-demo-workspace.v1',
  // Analytics persistence (Step 6). Device-local usage counters; restoring them onto another device
  // would re-assert stale activity metrics from a different session, which is misleading.
  'supermega.hq.local-metrics.v1',
  // Plant "Jobs to finish" view preference (list vs due-date board). A marker about how THIS
  // device displays jobs, not a business record: a restored backup must not flip another
  // device's chosen view. Same reasoning as the local metrics key above.
  'supermega.plant.job-view.v1',
]

const portablePrefixes = [
  'supermega.shop.order_draft.v1.',
  'supermega.plant.order-foundation.v1:',
  'supermega.website.release-foundation.v1:',
  'supermega.ecommerce.storefront_draft.v2.',
  'supermega.ecommerce.buying_lifecycle.v1.',
  // Customer loyalty points settings (shop-loyalty.ts), one record per workspace scope.
  // PORTABLE, the opposite call from photos and payment QRs: this record is an obligation
  // the shop has taken on -- customers were told points are counted from enabledAt at the
  // recorded rate history -- and every projected balance derives from it. A restore that
  // dropped it would zero every customer's points while keeping the orders that earned
  // them, which is exactly the silent-deletion shape this list exists to prevent.
  'supermega.shop.loyalty.v1.',
]

/** Same contract as deliberatelyNotPortableKeys, for the prefixed families. */
export const deliberatelyNotPortablePrefixes: readonly string[] = [
  // Superseded draft family; the .v2. prefix above carries the live one.
  'supermega.ecommerce.storefront_draft.v1.',
  // Recovery exports written when a website workspace fails to load. They describe a fault on THIS
  // device, and restoring them onto another would re-assert a problem that is not there.
  'supermega.website.workspace.recovery.v1.',
]

/**
 * The only place a storage key is turned into a word an owner reads. Used by the backup summary AND
 * by the restore deletion preview, so the two cannot name the same record differently.
 *
 * The families are matched by their whole prefix rather than by one draft family each, because
 * anything unmatched falls through to 'Controls' and reads as scaffolding. Under the narrower
 * matchers the appointment book and the lead ledger -- the two records whose loss started this --
 * both landed in 'Controls', which is the last label that would make an owner stop and look.
 */
const categoryMatchers: Array<[string, (key: string) => boolean]> = [
  ['Shop', (key) => key === 'supermega.commerce.workspace.v2' || key.startsWith('supermega.shop.')],
  ['Plant', (key) => key === 'supermega.production.workspace.v2' || key.startsWith('supermega.plant.')],
  ['Website', (key) => key.startsWith('supermega.website.')],
  ['Ecommerce', (key) => key === 'supermega.website-ecommerce-handoff.v1' || key.startsWith('supermega.ecommerce.')],
  ['Controls', () => true],
]

export type CompanyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export type CompanyBackupRecord = {
  key: string
  value: string
}

export type CompanySnapshot = {
  contract: typeof COMPANY_SNAPSHOT_CONTRACT
  version: 1
  exportedAt: string
  records: CompanyBackupRecord[]
  authRecordsIncluded: false
  managedWorkspaceRecordsIncluded: false
  externalWritesPerformed: false
}

export type EncryptedCompanyBackup = {
  contract: typeof COMPANY_BACKUP_CONTRACT
  version: 1
  algorithm: 'AES-GCM-256'
  kdf: 'PBKDF2-SHA-256'
  iterations: typeof COMPANY_BACKUP_KDF_ITERATIONS
  createdAt: string
  recordCount: number
  salt: string
  iv: string
  snapshotDigest: string
  ciphertext: string
}

export type CompanyBackupInspection = {
  contract: typeof COMPANY_SNAPSHOT_CONTRACT
  exportedAt: string
  recordCount: number
  snapshotDigest: string
  categories: Array<{ label: string; count: number }>
  authRecordsIncluded: false
  managedWorkspaceRecordsIncluded: false
  externalWritesPerformed: false
  snapshot: CompanySnapshot
}

/**
 * What a restore would do to THIS device, key by key, before anything is written.
 *
 * `deleting` is the reason this type exists. A restore writes the union of the snapshot's keys and
 * every resettable key already here, and a key the snapshot does not carry resolves to null, which
 * means removeItem. So a record created after the backup was taken -- an order draft started at
 * 14:00 against a backup taken at 09:00 -- is deleted purely because of when it was made, and until
 * now the owner only learned a count after the write.
 */
export type CompanyRestorePlan = {
  /** Held here and in the backup, with different contents. The backup's copy wins. */
  replacing: string[]
  /** Held here and NOT in the backup. Restore removes these. Newer work lands here. */
  deleting: string[]
  /**
   * The subset of `deleting` that is cleared on EVERY restore by design: keys that are
   * deliberately not portable, so a backup can never carry them and their removal is never a
   * loss of the owner's work. Split out because warning about them would fire the "you will
   * lose newer records" acknowledgement on every restore, including one taken seconds ago --
   * and an alarm that always sounds is one the owner learns to click past, which is worse than
   * no alarm on the one restore that would really cost them a day of appointments.
   */
  clearedByDesign: string[]
  /** `deleting` minus `clearedByDesign`: what the owner actually stands to lose. Warn on THIS. */
  losingOwnerWork: string[]
  /** In the backup and not here yet. */
  adding: string[]
  /** In both, already identical. */
  unchanged: string[]
}

export type CompanyRestoreResult = {
  restoredCount: number
  removedCount: number
  snapshotDigest: string
  authRecordsRestored: false
  managedWorkspaceRecordsRestored: false
  externalWritesPerformed: false
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function backupError(message: string): Error {
  return new Error(message)
}

function cryptoProvider(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw backupError('Encrypted backup is unavailable in this browser.')
  }
  return globalThis.crypto
}

function requirePassphrase(passphrase: string): string {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH || passphrase.length > MAX_PASSPHRASE_LENGTH) {
    throw backupError(`Use a backup password between ${MIN_PASSPHRASE_LENGTH} and ${MAX_PASSPHRASE_LENGTH} characters.`)
  }
  return passphrase
}

function exactObjectKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function canonicalDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw backupError(`${label} is invalid.`)
  }
  return value
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function base64ToBytes(value: unknown, label: string, maxBytes: number): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxBytes / 3) * 4 + 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw backupError(`${label} is invalid.`)
  }
  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw backupError(`${label} is invalid.`)
  }
  if (binary.length > maxBytes) throw backupError(`${label} is too large.`)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (bytesToBase64(bytes) !== value) throw backupError(`${label} is not canonical.`)
  return bytes
}

async function sha256(value: string): Promise<string> {
  const digest = await cryptoProvider().subtle.digest('SHA-256', encoder.encode(value))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function listStorageKeys(storage: CompanyStorage): string[] {
  if (!Number.isInteger(storage.length) || storage.length < 0 || storage.length > MAX_STORAGE_KEYS) {
    throw backupError('Browser storage has too many records to inspect safely.')
  }
  const keys = new Set<string>()
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (typeof key === 'string') keys.add(key)
  }
  return [...keys].sort()
}

export function isPortableCompanyStorageKey(key: string): boolean {
  return portableExactKeys.has(key) || portablePrefixes.some((prefix) => key.startsWith(prefix))
}

export function isResettableCompanyStorageKey(key: string): boolean {
  return isLocalWorkspaceKey(key)
}

export function listPortableCompanyStorageKeys(storage: CompanyStorage): string[] {
  return listStorageKeys(storage).filter(isPortableCompanyStorageKey)
}

export function listResettableCompanyStorageKeys(storage: CompanyStorage): string[] {
  return listStorageKeys(storage).filter(isResettableCompanyStorageKey)
}

function parseRecord(value: unknown, index: number): CompanyBackupRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !exactObjectKeys(value as Record<string, unknown>, ['key', 'value'])) {
    throw backupError(`Backup record ${index + 1} is invalid.`)
  }
  const { key, value: raw } = value as Record<string, unknown>
  if (typeof key !== 'string' || key.length === 0 || key.length > 180 || !isPortableCompanyStorageKey(key)) {
    throw backupError(`Backup record ${index + 1} is not an allowed company record.`)
  }
  if (typeof raw !== 'string' || encoder.encode(raw).byteLength > MAX_RECORD_BYTES) {
    throw backupError(`Backup record ${index + 1} is too large.`)
  }
  try {
    JSON.parse(raw)
  } catch {
    throw backupError(`Backup record ${index + 1} is not valid company JSON.`)
  }
  return { key, value: raw }
}

export function validateCompanySnapshot(value: unknown): CompanySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw backupError('The decrypted company snapshot is invalid.')
  const source = value as Record<string, unknown>
  if (!exactObjectKeys(source, ['authRecordsIncluded', 'contract', 'exportedAt', 'externalWritesPerformed', 'managedWorkspaceRecordsIncluded', 'records', 'version'])
    || source.contract !== COMPANY_SNAPSHOT_CONTRACT
    || source.version !== 1
    || source.authRecordsIncluded !== false
    || source.managedWorkspaceRecordsIncluded !== false
    || source.externalWritesPerformed !== false
    || !Array.isArray(source.records)
    || source.records.length > MAX_RECORDS) {
    throw backupError('The decrypted company snapshot failed its safety contract.')
  }
  const records = source.records.map(parseRecord).sort((left, right) => left.key.localeCompare(right.key))
  if (new Set(records.map((record) => record.key)).size !== records.length) throw backupError('The company snapshot contains duplicate records.')
  const snapshot: CompanySnapshot = {
    contract: COMPANY_SNAPSHOT_CONTRACT,
    version: 1,
    exportedAt: canonicalDate(source.exportedAt, 'Snapshot date'),
    records,
    authRecordsIncluded: false,
    managedWorkspaceRecordsIncluded: false,
    externalWritesPerformed: false,
  }
  if (encoder.encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) throw backupError('The company snapshot is too large.')
  return snapshot
}

function parseEnvelope(value: unknown): EncryptedCompanyBackup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw backupError('This is not a SuperMega encrypted company backup.')
  const source = value as Record<string, unknown>
  if (!exactObjectKeys(source, ['algorithm', 'ciphertext', 'contract', 'createdAt', 'iterations', 'iv', 'kdf', 'recordCount', 'salt', 'snapshotDigest', 'version'])
    || source.contract !== COMPANY_BACKUP_CONTRACT
    || source.version !== 1
    || source.algorithm !== 'AES-GCM-256'
    || source.kdf !== 'PBKDF2-SHA-256'
    || source.iterations !== COMPANY_BACKUP_KDF_ITERATIONS
    || !Number.isInteger(source.recordCount)
    || (source.recordCount as number) < 1
    || (source.recordCount as number) > MAX_RECORDS
    || typeof source.snapshotDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(source.snapshotDigest)) {
    throw backupError('The encrypted backup failed its safety contract.')
  }
  canonicalDate(source.createdAt, 'Backup date')
  base64ToBytes(source.salt, 'Backup salt', 16)
  base64ToBytes(source.iv, 'Backup IV', 12)
  base64ToBytes(source.ciphertext, 'Encrypted company data', MAX_CIPHERTEXT_BYTES)
  return source as EncryptedCompanyBackup
}

function authenticatedHeader(envelope: Omit<EncryptedCompanyBackup, 'ciphertext'>): Uint8Array {
  return encoder.encode(JSON.stringify([
    envelope.contract,
    envelope.version,
    envelope.algorithm,
    envelope.kdf,
    envelope.iterations,
    envelope.createdAt,
    envelope.recordCount,
    envelope.salt,
    envelope.iv,
    envelope.snapshotDigest,
  ]))
}

async function encryptionKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = cryptoProvider().subtle
  const material = await subtle.importKey('raw', encoder.encode(requirePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: arrayBuffer(salt), iterations: COMPANY_BACKUP_KDF_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function collectSnapshot(storage: CompanyStorage, exportedAt: string): CompanySnapshot {
  const keys = listPortableCompanyStorageKeys(storage)
  if (keys.length === 0) throw backupError('No local company data is available to back up yet.')
  if (keys.length > MAX_RECORDS) throw backupError('There are too many company records for one backup.')
  return validateCompanySnapshot({
    contract: COMPANY_SNAPSHOT_CONTRACT,
    version: 1,
    exportedAt,
    records: keys.map((key) => ({ key, value: storage.getItem(key) })),
    authRecordsIncluded: false,
    managedWorkspaceRecordsIncluded: false,
    externalWritesPerformed: false,
  })
}

export async function createEncryptedCompanyBackup(storage: CompanyStorage, passphrase: string, now = new Date()): Promise<{ envelope: EncryptedCompanyBackup; filename: string; json: string }> {
  const createdAt = canonicalDate(now.toISOString(), 'Backup date')
  const snapshot = collectSnapshot(storage, createdAt)
  const plaintext = JSON.stringify(snapshot)
  const snapshotDigest = await sha256(plaintext)
  const salt = cryptoProvider().getRandomValues(new Uint8Array(16))
  const iv = cryptoProvider().getRandomValues(new Uint8Array(12))
  const metadata: Omit<EncryptedCompanyBackup, 'ciphertext'> = {
    contract: COMPANY_BACKUP_CONTRACT,
    version: 1,
    algorithm: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA-256',
    iterations: COMPANY_BACKUP_KDF_ITERATIONS,
    createdAt,
    recordCount: snapshot.records.length,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    snapshotDigest,
  }
  const ciphertext = await cryptoProvider().subtle.encrypt(
    { name: 'AES-GCM', iv: arrayBuffer(iv), additionalData: arrayBuffer(authenticatedHeader(metadata)), tagLength: 128 },
    await encryptionKey(passphrase, salt),
    encoder.encode(plaintext),
  )
  const envelope: EncryptedCompanyBackup = { ...metadata, ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
  const json = `${JSON.stringify(envelope, null, 2)}\n`
  if (encoder.encode(json).byteLength > MAX_BACKUP_BYTES) throw backupError('The encrypted company backup is too large.')
  return { envelope, filename: `supermega-company-backup-${createdAt.slice(0, 10)}.json`, json }
}

/** Groups keys into the words an owner reads. Exported so the deletion preview counts the same way. */
export function summarizeCompanyStorageKeys(keys: readonly string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>()
  for (const key of keys) {
    const label = categoryMatchers.find(([, matcher]) => matcher(key))?.[0] ?? 'Controls'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return categoryMatchers.map(([label]) => ({ label, count: counts.get(label) ?? 0 })).filter((item) => item.count > 0)
}

export async function inspectEncryptedCompanyBackup(input: string, passphrase: string): Promise<CompanyBackupInspection> {
  if (typeof input !== 'string' || encoder.encode(input).byteLength > MAX_BACKUP_BYTES) throw backupError('The encrypted backup file is too large.')
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    throw backupError('This file is not valid backup JSON.')
  }
  const envelope = parseEnvelope(parsed)
  const salt = base64ToBytes(envelope.salt, 'Backup salt', 16)
  const iv = base64ToBytes(envelope.iv, 'Backup IV', 12)
  const ciphertext = base64ToBytes(envelope.ciphertext, 'Encrypted company data', MAX_CIPHERTEXT_BYTES)
  const { ciphertext: _ciphertext, ...metadata } = envelope
  void _ciphertext
  let plaintext: string
  try {
    const decrypted = await cryptoProvider().subtle.decrypt(
      { name: 'AES-GCM', iv: arrayBuffer(iv), additionalData: arrayBuffer(authenticatedHeader(metadata)), tagLength: 128 },
      await encryptionKey(passphrase, salt),
      arrayBuffer(ciphertext),
    )
    plaintext = decoder.decode(decrypted)
  } catch {
    throw backupError('The backup password is wrong or the file was changed. Nothing was restored.')
  }
  let snapshotValue: unknown
  try {
    snapshotValue = JSON.parse(plaintext)
  } catch {
    throw backupError('The decrypted company snapshot is invalid. Nothing was restored.')
  }
  const snapshot = validateCompanySnapshot(snapshotValue)
  const digest = await sha256(JSON.stringify(snapshot))
  if (digest !== envelope.snapshotDigest || snapshot.records.length !== envelope.recordCount || snapshot.exportedAt !== envelope.createdAt) {
    throw backupError('The encrypted backup integrity check failed. Nothing was restored.')
  }
  return {
    contract: COMPANY_SNAPSHOT_CONTRACT,
    exportedAt: snapshot.exportedAt,
    recordCount: snapshot.records.length,
    snapshotDigest: digest,
    categories: summarizeCompanyStorageKeys(snapshot.records.map((record) => record.key)),
    authRecordsIncluded: false,
    managedWorkspaceRecordsIncluded: false,
    externalWritesPerformed: false,
    snapshot,
  }
}

function lockNameForRestoreKey(key: string): string | null {
  if (key === COMMERCE_KEY) return COMMERCE_LOCK
  if (key === PRODUCTION_KEY) return PRODUCTION_LOCK
  return null
}

function writeRestoreValue(storage: CompanyStorage, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key)
  else storage.setItem(key, value)
}

async function restoreValues(storage: CompanyStorage, values: Map<string, string | null>, lockManager: BackupLockManager | undefined): Promise<void> {
  for (const [key, value] of values) {
    const lockName = lockNameForRestoreKey(key)
    if (lockName && lockManager?.request) {
      await lockManager.request(lockName, { mode: 'exclusive' }, () => writeRestoreValue(storage, key, value))
    } else {
      writeRestoreValue(storage, key, value)
    }
  }
}

function valuesMatch(storage: CompanyStorage, values: Map<string, string | null>): boolean {
  return [...values].every(([key, value]) => storage.getItem(key) === value)
}

/**
 * What restoring this backup onto this device would change, without changing anything.
 *
 * restoreCompanyBackup is built from the plan this returns rather than from its own second
 * derivation of the same sets. A preview that re-derived them would agree today and drift later,
 * and the failure mode of that drift is a deletion the owner was never shown.
 */
function clearedByDesign(key: string) {
  return deliberatelyNotPortableKeys.includes(key)
    || deliberatelyNotPortablePrefixes.some((prefix) => key.startsWith(prefix))
}

export function planCompanyRestore(storage: CompanyStorage, inspection: CompanyBackupInspection): CompanyRestorePlan {
  if (!inspection || inspection.contract !== COMPANY_SNAPSHOT_CONTRACT || inspection.authRecordsIncluded !== false || inspection.managedWorkspaceRecordsIncluded !== false) {
    throw backupError('Inspect this encrypted backup before restoring it.')
  }
  const snapshot = validateCompanySnapshot(inspection.snapshot)
  // Recovery markers and legacy drafts are not portable, but they can override
  // restored records. Clear them inside the same rollback-protected transaction.
  const currentKeys = listResettableCompanyStorageKeys(storage)
  const incoming = new Map(snapshot.records.map((record) => [record.key, record.value]))
  const affectedKeys = [...new Set([...currentKeys, ...incoming.keys()])].sort()
  const plan: CompanyRestorePlan = { replacing: [], deleting: [], clearedByDesign: [], losingOwnerWork: [], adding: [], unchanged: [] }
  for (const key of affectedKeys) {
    const next = incoming.get(key) ?? null
    const current = storage.getItem(key)
    // A key that is already absent cannot be destroyed, so it is not a loss worth warning about.
    if (next === null) {
      if (current !== null) {
        plan.deleting.push(key)
        // A key a backup can never carry is not the owner's newer work; it is scaffolding this
        // restore is meant to clear.
        if (clearedByDesign(key)) plan.clearedByDesign.push(key)
        else plan.losingOwnerWork.push(key)
      }
    }
    else if (current === null) plan.adding.push(key)
    else if (current === next) plan.unchanged.push(key)
    else plan.replacing.push(key)
  }
  return plan
}

export async function restoreCompanyBackup(
  storage: CompanyStorage,
  inspection: CompanyBackupInspection,
  lockManager = globalThis.navigator?.locks as unknown as BackupLockManager | undefined,
): Promise<CompanyRestoreResult> {
  if (!inspection || inspection.contract !== COMPANY_SNAPSHOT_CONTRACT || inspection.authRecordsIncluded !== false || inspection.managedWorkspaceRecordsIncluded !== false) {
    throw backupError('Inspect this encrypted backup before restoring it.')
  }
  const snapshot = validateCompanySnapshot(inspection.snapshot)
  const snapshotDigest = await sha256(JSON.stringify(snapshot))
  if (snapshotDigest !== inspection.snapshotDigest || snapshot.records.length !== inspection.recordCount) {
    throw backupError('The inspected backup changed before restore. Inspect it again.')
  }
  // The write is driven by the same plan the panel previews. A key can only be removed here if it
  // was named in plan.deleting, so "shown" and "deleted" are one set rather than two that agree.
  const plan = planCompanyRestore(storage, inspection)
  const incoming = new Map(snapshot.records.map((record) => [record.key, record.value]))
  const removing = new Set(plan.deleting)
  const affectedKeys = [...plan.replacing, ...plan.adding, ...plan.unchanged, ...plan.deleting].sort()
  const previous = new Map(affectedKeys.map((key) => [key, storage.getItem(key)]))
  const target = new Map(affectedKeys.map((key) => [key, removing.has(key) ? null : incoming.get(key) ?? null]))
  try {
    await restoreValues(storage, target, lockManager)
    if (!valuesMatch(storage, target)) throw backupError('The browser did not confirm every restored record.')
  } catch (error) {
    try {
      await restoreValues(storage, previous, lockManager)
      if (!valuesMatch(storage, previous)) throw backupError('Rollback verification failed.')
    } catch {
      throw backupError('Restore failed and the previous local state could not be verified. Stop using this browser and keep the backup file.')
    }
    throw backupError(`Restore failed; the previous company state was restored. ${error instanceof Error ? error.message : ''}`.trim())
  }
  return {
    restoredCount: plan.replacing.length + plan.adding.length + plan.unchanged.length,
    removedCount: plan.deleting.length,
    snapshotDigest,
    authRecordsRestored: false,
    managedWorkspaceRecordsRestored: false,
    externalWritesPerformed: false,
  }
}
