import {
  COMMERCE_KEY,
  COMMERCE_LOCK,
  validateCommerceState,
  type CommerceActionProof,
  type CommerceState,
} from './commerce-workspace.ts'

export const COMMERCE_SYNC_OUTBOX_CONTRACT = 'supermega.commerce.sync-outbox.v1' as const
export const COMMERCE_SYNC_DATABASE = 'supermega-sync-v1'
export const COMMERCE_SYNC_DATABASE_VERSION = 1
export const COMMERCE_SYNC_OUTBOX_STORE = 'commerce-outbox'
export const COMMERCE_SYNC_RECEIPT_STORE = 'commerce-receipts'
export const COMMERCE_SYNC_MAX_PENDING = 32
export const COMMERCE_SYNC_MAX_STATE_BYTES = 2 * 1024 * 1024

const digestPattern = /^sha256:[0-9a-f]{64}$/
const eventTypePattern = /^commerce\.[a-z0-9_.-]{1,119}$/

type CommerceSyncReceiptStatus = 'local_applied' | 'abandoned'

export type CommerceSyncIntent = {
  contract: typeof COMMERCE_SYNC_OUTBOX_CONTRACT
  commandId: string
  eventType: string
  stagedAt: string
  baseDigest: string
  candidateDigest: string
  candidateRaw: string
  evidence: CommerceActionProof
}

export type CommerceSyncReceipt = {
  contract: typeof COMMERCE_SYNC_OUTBOX_CONTRACT
  commandId: string
  eventType: string
  status: CommerceSyncReceiptStatus
  candidateDigest: string
  acknowledgedAt: string
  recovered: boolean
}

export type CommerceSyncStatus = {
  status: 'checking' | 'ready' | 'pending' | 'conflict' | 'unavailable' | 'managed'
  pendingCount: number
  recoveredCount: number
  replayedCount: number
  conflictCount: number
  message: string
}

type CommerceSyncStageInput = {
  commandId: string
  eventType: string
  evidence: CommerceActionProof
  baseState: CommerceState
  candidateState: CommerceState
  stagedAt?: string
}

type CommerceSyncStorage = Pick<Storage, 'getItem' | 'setItem'>
type CommerceSyncLockManager = {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>
}

function hasExactKeys(value: object, keys: string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function safeText(value: unknown, field: string, maximum: number) {
  const hasControlCharacter = typeof value === 'string' && Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) as number
    return codePoint <= 31 || codePoint === 127
  })
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || hasControlCharacter) {
    throw new Error(`The Shop sync ${field} is invalid.`)
  }
  return value
}

function safeTimestamp(value: unknown, field: string) {
  const timestamp = safeText(value, field, 40)
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`The Shop sync ${field} is invalid.`)
  return timestamp
}

function safeEvidenceText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`The Shop sync ${field} is invalid.`)
  return value
}

function validateEvidence(value: unknown): CommerceActionProof {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, ['actionId', 'actor', 'capturedAt', 'evidenceReference', 'reason'])) {
    throw new Error('The Shop sync evidence is invalid.')
  }
  const evidence = value as Partial<CommerceActionProof>
  return {
    actionId: safeText(evidence.actionId, 'action ID', 180),
    actor: safeEvidenceText(evidence.actor, 'actor', 180),
    capturedAt: safeTimestamp(evidence.capturedAt, 'capture time'),
    evidenceReference: safeEvidenceText(evidence.evidenceReference, 'evidence reference', 4_096),
    reason: safeEvidenceText(evidence.reason, 'reason', 1_000),
  }
}

function validateIntent(value: unknown): CommerceSyncIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, ['baseDigest', 'candidateDigest', 'candidateRaw', 'commandId', 'contract', 'eventType', 'evidence', 'stagedAt'])) {
    throw new Error('The saved Shop sync intent is invalid.')
  }
  const intent = value as Partial<CommerceSyncIntent>
  const commandId = safeText(intent.commandId, 'command ID', 180)
  const eventType = safeText(intent.eventType, 'event type', 120)
  const stagedAt = safeTimestamp(intent.stagedAt, 'staging time')
  if (intent.contract !== COMMERCE_SYNC_OUTBOX_CONTRACT
    || !eventTypePattern.test(eventType)
    || typeof intent.baseDigest !== 'string'
    || !digestPattern.test(intent.baseDigest)
    || typeof intent.candidateDigest !== 'string'
    || !digestPattern.test(intent.candidateDigest)
    || typeof intent.candidateRaw !== 'string'
    || new TextEncoder().encode(intent.candidateRaw).byteLength > COMMERCE_SYNC_MAX_STATE_BYTES) {
    throw new Error('The saved Shop sync intent is invalid.')
  }
  validateCommerceState(JSON.parse(intent.candidateRaw))
  return {
    contract: COMMERCE_SYNC_OUTBOX_CONTRACT,
    commandId,
    eventType,
    stagedAt,
    baseDigest: intent.baseDigest,
    candidateDigest: intent.candidateDigest,
    candidateRaw: intent.candidateRaw,
    evidence: validateEvidence(intent.evidence),
  }
}

function validateReceipt(value: unknown): CommerceSyncReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, ['acknowledgedAt', 'candidateDigest', 'commandId', 'contract', 'eventType', 'recovered', 'status'])) {
    throw new Error('The saved Shop sync receipt is invalid.')
  }
  const receipt = value as Partial<CommerceSyncReceipt>
  const eventType = safeText(receipt.eventType, 'receipt event type', 120)
  if (receipt.contract !== COMMERCE_SYNC_OUTBOX_CONTRACT
    || (receipt.status !== 'local_applied' && receipt.status !== 'abandoned')
    || typeof receipt.candidateDigest !== 'string'
    || !digestPattern.test(receipt.candidateDigest)
    || typeof receipt.recovered !== 'boolean'
    || !eventTypePattern.test(eventType)) throw new Error('The saved Shop sync receipt is invalid.')
  return {
    contract: COMMERCE_SYNC_OUTBOX_CONTRACT,
    commandId: safeText(receipt.commandId, 'receipt command ID', 180),
    eventType,
    status: receipt.status,
    candidateDigest: receipt.candidateDigest,
    acknowledgedAt: safeTimestamp(receipt.acknowledgedAt, 'acknowledgement time'),
    recovered: receipt.recovered,
  }
}

function indexedDbFactory() {
  try { return globalThis.indexedDB } catch { return undefined }
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The Shop sync database request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('The Shop sync database transaction was interrupted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('The Shop sync database transaction failed.'))
  })
}

async function openDatabase() {
  const factory = indexedDbFactory()
  if (!factory) throw new Error('IndexedDB is unavailable, so Shop recovery cannot protect this change.')
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(COMMERCE_SYNC_DATABASE, COMMERCE_SYNC_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const upgradeDatabase = request.result
      if (!upgradeDatabase.objectStoreNames.contains(COMMERCE_SYNC_OUTBOX_STORE)) {
        const outbox = upgradeDatabase.createObjectStore(COMMERCE_SYNC_OUTBOX_STORE, { keyPath: 'commandId' })
        outbox.createIndex('stagedAt', 'stagedAt', { unique: false })
      }
      if (!upgradeDatabase.objectStoreNames.contains(COMMERCE_SYNC_RECEIPT_STORE)) {
        const receipts = upgradeDatabase.createObjectStore(COMMERCE_SYNC_RECEIPT_STORE, { keyPath: 'commandId' })
        receipts.createIndex('acknowledgedAt', 'acknowledgedAt', { unique: false })
      }
    }
    // An IDBOpenDBRequest cannot be cancelled, so a 'blocked' rejection does not
    // stop the request: when the blocking tab closes, the upgrade completes and
    // onsuccess still fires with a live connection whose resolve() is a no-op.
    // Nobody would receive or close that IDBDatabase, and an open connection is
    // exactly what blocks the NEXT upgrade — so a single blocked open could wedge
    // Shop recovery for the rest of the page's life, on the path that protects
    // staged commerce writes. Close a late connection instead.
    let settled = false
    request.onerror = () => {
      if (settled) return
      settled = true
      reject(request.error ?? new Error('The Shop sync database could not be opened.'))
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      reject(new Error('Another tab blocked the Shop sync database upgrade.'))
    }
    request.onsuccess = () => {
      if (settled) {
        request.result.close()
        return
      }
      settled = true
      resolve(request.result)
    }
  })
  database.onversionchange = () => database.close()
  return database
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure hashing is unavailable, so Shop recovery cannot protect this change.')
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function sameIntent(left: CommerceSyncIntent, right: CommerceSyncIntent) {
  return left.commandId === right.commandId
    && left.eventType === right.eventType
    && left.baseDigest === right.baseDigest
    && left.candidateDigest === right.candidateDigest
    && left.candidateRaw === right.candidateRaw
    && JSON.stringify(left.evidence) === JSON.stringify(right.evidence)
}

export async function stageLocalCommerceSyncIntent(input: CommerceSyncStageInput) {
  const commandId = safeText(input.commandId, 'command ID', 180)
  const eventType = safeText(input.eventType, 'event type', 120)
  if (!eventTypePattern.test(eventType)) throw new Error('The Shop sync event type is invalid.')
  const baseRaw = JSON.stringify(validateCommerceState(input.baseState))
  const candidateRaw = JSON.stringify(validateCommerceState(input.candidateState))
  if (new TextEncoder().encode(candidateRaw).byteLength > COMMERCE_SYNC_MAX_STATE_BYTES) {
    throw new Error('The Shop workspace is too large for safe local recovery. Nothing was written.')
  }
  const intent = validateIntent({
    contract: COMMERCE_SYNC_OUTBOX_CONTRACT,
    commandId,
    eventType,
    stagedAt: input.stagedAt ?? new Date().toISOString(),
    baseDigest: await sha256(baseRaw),
    candidateDigest: await sha256(candidateRaw),
    candidateRaw,
    evidence: validateEvidence(input.evidence),
  })
  const database = await openDatabase()
  try {
    const readTransaction = database.transaction([COMMERCE_SYNC_OUTBOX_STORE, COMMERCE_SYNC_RECEIPT_STORE], 'readonly')
    const pendingRequest = readTransaction.objectStore(COMMERCE_SYNC_OUTBOX_STORE).get(commandId)
    const receiptRequest = readTransaction.objectStore(COMMERCE_SYNC_RECEIPT_STORE).get(commandId)
    const countRequest = readTransaction.objectStore(COMMERCE_SYNC_OUTBOX_STORE).count()
    const [pendingValue, receiptValue, pendingCount] = await Promise.all([
      requestValue(pendingRequest),
      requestValue(receiptRequest),
      requestValue(countRequest),
      transactionDone(readTransaction),
    ])
    if (receiptValue !== undefined) {
      const receipt = validateReceipt(receiptValue)
      if (receipt.eventType !== intent.eventType || receipt.candidateDigest !== intent.candidateDigest) {
        throw new Error('This Shop command ID already belongs to different recovery evidence.')
      }
      return { status: 'acknowledged_replay' as const, intent, receipt }
    }
    if (pendingValue !== undefined) {
      const pending = validateIntent(pendingValue)
      if (!sameIntent(pending, intent)) throw new Error('This Shop command ID already belongs to a different pending change.')
      return { status: 'pending_replay' as const, intent: pending, receipt: null }
    }
    if (pendingCount >= COMMERCE_SYNC_MAX_PENDING) {
      throw new Error(`Shop has ${COMMERCE_SYNC_MAX_PENDING} pending recovery records. Reload and recover them before another change.`)
    }
    const writeTransaction = database.transaction(COMMERCE_SYNC_OUTBOX_STORE, 'readwrite')
    writeTransaction.objectStore(COMMERCE_SYNC_OUTBOX_STORE).add(intent)
    await transactionDone(writeTransaction)
    return { status: 'staged' as const, intent, receipt: null }
  } finally {
    database.close()
  }
}

async function settleIntent(commandIdValue: string, status: CommerceSyncReceiptStatus, recovered: boolean, acknowledgedAt = new Date().toISOString()) {
  const commandId = safeText(commandIdValue, 'command ID', 180)
  const database = await openDatabase()
  try {
    const readTransaction = database.transaction([COMMERCE_SYNC_OUTBOX_STORE, COMMERCE_SYNC_RECEIPT_STORE], 'readonly')
    const pendingRequest = readTransaction.objectStore(COMMERCE_SYNC_OUTBOX_STORE).get(commandId)
    const receiptRequest = readTransaction.objectStore(COMMERCE_SYNC_RECEIPT_STORE).get(commandId)
    const [pendingValue, receiptValue] = await Promise.all([
      requestValue(pendingRequest),
      requestValue(receiptRequest),
      transactionDone(readTransaction),
    ])
    if (receiptValue !== undefined) return { receipt: validateReceipt(receiptValue), replayed: true }
    if (pendingValue === undefined) throw new Error('The pending Shop sync intent no longer exists.')
    const intent = validateIntent(pendingValue)
    const receipt = validateReceipt({
      contract: COMMERCE_SYNC_OUTBOX_CONTRACT,
      commandId,
      eventType: intent.eventType,
      status,
      candidateDigest: intent.candidateDigest,
      acknowledgedAt,
      recovered,
    })
    const writeTransaction = database.transaction([COMMERCE_SYNC_OUTBOX_STORE, COMMERCE_SYNC_RECEIPT_STORE], 'readwrite')
    try {
      writeTransaction.objectStore(COMMERCE_SYNC_OUTBOX_STORE).delete(commandId)
      writeTransaction.objectStore(COMMERCE_SYNC_RECEIPT_STORE).add(receipt)
    } catch (error) {
      writeTransaction.abort()
      throw error
    }
    await transactionDone(writeTransaction)
    return { receipt, replayed: false }
  } finally {
    database.close()
  }
}

export function acknowledgeLocalCommerceSyncIntent(commandId: string, recovered = false) {
  return settleIntent(commandId, 'local_applied', recovered)
}

export function abandonLocalCommerceSyncIntent(commandId: string) {
  return settleIntent(commandId, 'abandoned', false)
}

export async function readLocalCommerceSyncIntents() {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(COMMERCE_SYNC_OUTBOX_STORE, 'readonly')
    const values = await Promise.all([
      requestValue(transaction.objectStore(COMMERCE_SYNC_OUTBOX_STORE).getAll()),
      transactionDone(transaction),
    ])
    return (values[0] as unknown[]).map(validateIntent).sort((left, right) => left.stagedAt.localeCompare(right.stagedAt) || left.commandId.localeCompare(right.commandId))
  } finally {
    database.close()
  }
}

export async function recoverLocalCommerceSyncOutbox(
  storage: CommerceSyncStorage | undefined = globalThis.localStorage,
  lockManager: CommerceSyncLockManager | undefined = globalThis.navigator?.locks as CommerceSyncLockManager | undefined,
): Promise<CommerceSyncStatus> {
  if (!storage || !lockManager?.request) throw new Error('Safe Shop recovery storage and write locking are unavailable.')
  const pending = await readLocalCommerceSyncIntents()
  if (!pending.length) return { status: 'ready', pendingCount: 0, recoveredCount: 0, replayedCount: 0, conflictCount: 0, message: '' }
  return lockManager.request(COMMERCE_LOCK, { mode: 'exclusive' }, async () => {
    let recoveredCount = 0
    let replayedCount = 0
    let conflictCount = 0
    for (const intent of pending) {
      const currentRaw = storage.getItem(COMMERCE_KEY)
      if (currentRaw === null) throw new Error('Shop recovery found no current workspace. Nothing was replayed.')
      validateCommerceState(JSON.parse(currentRaw))
      const currentDigest = await sha256(currentRaw)
      if (currentDigest === intent.candidateDigest) {
        await acknowledgeLocalCommerceSyncIntent(intent.commandId, true)
        recoveredCount += 1
        continue
      }
      if (currentDigest !== intent.baseDigest) {
        conflictCount += 1
        continue
      }
      const candidate = validateCommerceState(JSON.parse(intent.candidateRaw))
      const candidateRaw = JSON.stringify(candidate)
      if (await sha256(candidateRaw) !== intent.candidateDigest) throw new Error('The pending Shop change failed its recovery digest. Nothing was replayed.')
      storage.setItem(COMMERCE_KEY, candidateRaw)
      if (storage.getItem(COMMERCE_KEY) !== candidateRaw) throw new Error('Shop recovery could not confirm the workspace write.')
      await acknowledgeLocalCommerceSyncIntent(intent.commandId, true)
      recoveredCount += 1
      replayedCount += 1
    }
    const remaining = await readLocalCommerceSyncIntents()
    return {
      status: conflictCount ? 'conflict' : remaining.length ? 'pending' : 'ready',
      pendingCount: remaining.length,
      recoveredCount,
      replayedCount,
      conflictCount,
      message: conflictCount
        ? `${conflictCount} saved Shop change${conflictCount === 1 ? '' : 's'} no longer matches the current workspace. Nothing was overwritten.`
        : recoveredCount
          ? `Recovered ${recoveredCount} reviewed Shop change${recoveredCount === 1 ? '' : 's'} from this device without duplicating it.`
          : '',
    }
  })
}

export const checkingCommerceSyncStatus: CommerceSyncStatus = {
  status: 'checking',
  pendingCount: 0,
  recoveredCount: 0,
  replayedCount: 0,
  conflictCount: 0,
  message: 'Checking Shop recovery on this device.',
}

export const managedCommerceSyncStatus: CommerceSyncStatus = {
  status: 'managed',
  pendingCount: 0,
  recoveredCount: 0,
  replayedCount: 0,
  conflictCount: 0,
  message: '',
}
