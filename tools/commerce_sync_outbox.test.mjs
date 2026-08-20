import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  COMMERCE_SYNC_MAX_PENDING,
  COMMERCE_SYNC_OUTBOX_CONTRACT,
  abandonLocalCommerceSyncIntent,
  acknowledgeLocalCommerceSyncIntent,
  readLocalCommerceSyncIntents,
  recoverLocalCommerceSyncOutbox,
  stageLocalCommerceSyncIntent,
} from '../showroom/src/core/commerce-sync-outbox.ts'
import {
  COMMERCE_KEY,
  createEmptyCommerce,
  validateCommerceState,
} from '../showroom/src/core/commerce-workspace.ts'

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function canonicalRaw(state) {
  return JSON.stringify(validateCommerceState(state))
}

function memoryStorage(initialEntries = []) {
  const values = new Map(initialEntries)
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    entries: () => [...values.entries()],
  }
}

function serialLocks() {
  let queue = Promise.resolve()
  let requests = 0
  return {
    get requests() { return requests },
    request: (_name, _options, callback) => {
      requests += 1
      const run = queue.then(callback, callback)
      queue = run.then(() => undefined, () => undefined)
      return run
    },
  }
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
}

function createFakeIndexedDbFactory({ blockFirstOpen = false } = {}) {
  const databases = new Map()
  let blockedOnce = false

  function createTransaction(record, names, mode) {
    const storeNames = [].concat(names)
    const jobs = []
    const bufferedWrites = []
    let pumped = false
    let aborted = false
    const transaction = {
      error: null,
      oncomplete: null,
      onabort: null,
      onerror: null,
      abort() { aborted = true },
      objectStore(name) {
        if (!storeNames.includes(name) || !record.stores.has(name)) throw new Error(`NotFoundError: ${name}`)
        const rows = record.stores.get(name)
        const enqueue = (job) => {
          const request = { result: undefined, error: null, onsuccess: null, onerror: null }
          jobs.push(() => {
            request.result = job()
            request.onsuccess?.()
          })
          schedule()
          return request
        }
        const requireWrite = () => {
          if (mode !== 'readwrite') throw new Error('ReadOnlyError: mutation inside a readonly transaction')
        }
        return {
          get: (key) => enqueue(() => (rows.has(key) ? structuredClone(rows.get(key)) : undefined)),
          count: () => enqueue(() => rows.size),
          getAll: () => enqueue(() => [...rows.values()].map((value) => structuredClone(value))),
          createIndex: () => ({}),
          add(value) {
            requireWrite()
            bufferedWrites.push({ kind: 'add', rows, key: value[record.keyPaths.get(name)], value: structuredClone(value) })
            return enqueue(() => undefined)
          },
          delete(key) {
            requireWrite()
            bufferedWrites.push({ kind: 'delete', rows, key })
            return enqueue(() => undefined)
          },
        }
      },
    }
    function schedule() {
      if (pumped) return
      pumped = true
      queueMicrotask(() => {
        if (aborted) {
          transaction.onabort?.()
          return
        }
        for (const job of jobs) job()
        const duplicate = bufferedWrites.find((write) => write.kind === 'add' && write.rows.has(write.key))
        if (aborted || duplicate) {
          transaction.error = duplicate ? new Error('ConstraintError: key already exists') : transaction.error
          transaction.onabort?.()
          return
        }
        for (const write of bufferedWrites) {
          if (write.kind === 'add') write.rows.set(write.key, write.value)
          else write.rows.delete(write.key)
        }
        transaction.oncomplete?.()
      })
    }
    schedule()
    return transaction
  }

  // `blockFirstOpen` reproduces the one sequence a real IndexedDB performs and a
  // naive fake never does: an upgrading open() that another tab is holding fires
  // 'blocked' FIRST and then, once that tab closes, still runs to completion and
  // fires 'success'. An IDBOpenDBRequest cannot be cancelled, so both handlers
  // really do run on the same request. closedConnections records every close()
  // so a test can assert the late connection was not orphaned.
  const closedConnections = []

  function createConnection(record) {
    return {
      onversionchange: null,
      objectStoreNames: { contains: (name) => record.stores.has(name) },
      createObjectStore(name, { keyPath }) {
        record.stores.set(name, new Map())
        record.keyPaths.set(name, keyPath)
        return { createIndex: () => ({}) }
      },
      transaction: (names, transactionMode) => createTransaction(record, names, transactionMode),
      close: () => { closedConnections.push(record) },
    }
  }

  return {
    closedConnections,
    open(name, version) {
      const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null }
      const blocked = blockFirstOpen && !blockedOnce
      if (blocked) blockedOnce = true
      queueMicrotask(() => {
        if (blocked) request.onblocked?.()
        queueMicrotask(() => {
          const upgrade = !databases.has(name)
          if (upgrade) databases.set(name, { version, stores: new Map(), keyPaths: new Map() })
          request.result = createConnection(databases.get(name))
          if (upgrade) request.onupgradeneeded?.()
          request.onsuccess?.()
        })
      })
      return request
    },
  }
}

async function withOutbox(run) {
  const restore = replaceGlobal('indexedDB', createFakeIndexedDbFactory())
  try {
    return await run()
  } finally {
    restore()
  }
}

const STAGED_AT = '2026-08-07T04:05:00.000Z'
const baseState = createEmptyCommerce()
const candidateState = {
  ...createEmptyCommerce(),
  items: [{ sku: 'SM-1001', name: 'Daily essentials basket', onHand: 34, reorderAt: 10, price: 18500 }],
}
const divergedState = {
  ...createEmptyCommerce(),
  items: [{ sku: 'SM-2002', name: 'Cold drink pack', onHand: 8, reorderAt: 12, price: 6500 }],
}

function proof(overrides = {}) {
  return {
    actionId: 'ACT-OUTBOX-TEST-1',
    actor: 'Test operator',
    capturedAt: '2026-08-07T04:00:00.000Z',
    evidenceReference: 'TEST-EVIDENCE-1',
    reason: 'Cover the Shop sync outbox contract.',
    ...overrides,
  }
}

function stageInput(overrides = {}) {
  return {
    commandId: 'CMD-OUTBOX-1',
    eventType: 'commerce.order.completed',
    evidence: proof(),
    baseState,
    candidateState,
    stagedAt: STAGED_AT,
    ...overrides,
  }
}

test('staged intent is durable, digest-bound, and readable across database opens', () => withOutbox(async () => {
  const staged = await stageLocalCommerceSyncIntent(stageInput())
  assert.equal(staged.status, 'staged')
  assert.equal(staged.receipt, null)
  assert.equal(staged.intent.contract, COMMERCE_SYNC_OUTBOX_CONTRACT)
  assert.equal(staged.intent.baseDigest, sha256(canonicalRaw(baseState)))
  assert.equal(staged.intent.candidateDigest, sha256(canonicalRaw(candidateState)))
  assert.equal(staged.intent.candidateRaw, canonicalRaw(candidateState))
  const pending = await readLocalCommerceSyncIntents()
  assert.equal(pending.length, 1)
  assert.deepEqual(pending[0], staged.intent)
}))

test('staging the exact same command again is an idempotent pending replay', () => withOutbox(async () => {
  await stageLocalCommerceSyncIntent(stageInput())
  const replay = await stageLocalCommerceSyncIntent(stageInput())
  assert.equal(replay.status, 'pending_replay')
  assert.equal((await readLocalCommerceSyncIntents()).length, 1)
}))

test('command ID reuse with a different pending change is rejected', () => withOutbox(async () => {
  await stageLocalCommerceSyncIntent(stageInput())
  await assert.rejects(
    () => stageLocalCommerceSyncIntent(stageInput({ candidateState: divergedState })),
    /already belongs to a different pending change/,
  )
  const pending = await readLocalCommerceSyncIntents()
  assert.equal(pending.length, 1)
  assert.equal(pending[0].candidateDigest, sha256(canonicalRaw(candidateState)))
}))

test('acknowledged command ID rejects different evidence and replays the same evidence', () => withOutbox(async () => {
  await stageLocalCommerceSyncIntent(stageInput())
  await acknowledgeLocalCommerceSyncIntent('CMD-OUTBOX-1')
  await assert.rejects(
    () => stageLocalCommerceSyncIntent(stageInput({ candidateState: divergedState })),
    /already belongs to different recovery evidence/,
  )
  const replay = await stageLocalCommerceSyncIntent(stageInput())
  assert.equal(replay.status, 'acknowledged_replay')
  assert.equal(replay.receipt.status, 'local_applied')
  assert.equal((await readLocalCommerceSyncIntents()).length, 0)
}))

test('acknowledgement settles the intent into a durable idempotent receipt', () => withOutbox(async () => {
  await stageLocalCommerceSyncIntent(stageInput())
  const settled = await acknowledgeLocalCommerceSyncIntent('CMD-OUTBOX-1')
  assert.equal(settled.replayed, false)
  assert.equal(settled.receipt.status, 'local_applied')
  assert.equal(settled.receipt.recovered, false)
  assert.equal(settled.receipt.candidateDigest, sha256(canonicalRaw(candidateState)))
  assert.equal((await readLocalCommerceSyncIntents()).length, 0)
  const again = await acknowledgeLocalCommerceSyncIntent('CMD-OUTBOX-1')
  assert.equal(again.replayed, true)
  assert.deepEqual(again.receipt, settled.receipt)
}))

test('abandonment records an abandoned receipt that later settlement cannot flip', () => withOutbox(async () => {
  await stageLocalCommerceSyncIntent(stageInput())
  const abandoned = await abandonLocalCommerceSyncIntent('CMD-OUTBOX-1')
  assert.equal(abandoned.replayed, false)
  assert.equal(abandoned.receipt.status, 'abandoned')
  assert.equal((await readLocalCommerceSyncIntents()).length, 0)
  const acknowledgeAfterAbandon = await acknowledgeLocalCommerceSyncIntent('CMD-OUTBOX-1')
  assert.equal(acknowledgeAfterAbandon.replayed, true)
  assert.equal(acknowledgeAfterAbandon.receipt.status, 'abandoned')
}))

test('settling a command that was never staged fails closed', () => withOutbox(async () => {
  await assert.rejects(() => acknowledgeLocalCommerceSyncIntent('CMD-NEVER-STAGED'), /no longer exists/)
}))

test('crash recovery replays the pending change onto the exact matching base workspace', () => withOutbox(async () => {
  const storage = memoryStorage([[COMMERCE_KEY, canonicalRaw(baseState)]])
  const locks = serialLocks()
  await stageLocalCommerceSyncIntent(stageInput())
  const status = await recoverLocalCommerceSyncOutbox(storage, locks)
  assert.equal(status.status, 'ready')
  assert.equal(status.recoveredCount, 1)
  assert.equal(status.replayedCount, 1)
  assert.equal(status.conflictCount, 0)
  assert.equal(storage.getItem(COMMERCE_KEY), canonicalRaw(candidateState))
  assert.equal(locks.requests, 1)
  assert.equal((await readLocalCommerceSyncIntents()).length, 0)
  const receipt = await acknowledgeLocalCommerceSyncIntent('CMD-OUTBOX-1')
  assert.equal(receipt.replayed, true)
  assert.equal(receipt.receipt.recovered, true)
}))

test('crash recovery after the workspace write but before acknowledgement does not duplicate it', () => withOutbox(async () => {
  const storage = memoryStorage([[COMMERCE_KEY, canonicalRaw(candidateState)]])
  await stageLocalCommerceSyncIntent(stageInput())
  const status = await recoverLocalCommerceSyncOutbox(storage, serialLocks())
  assert.equal(status.status, 'ready')
  assert.equal(status.recoveredCount, 1)
  assert.equal(status.replayedCount, 0)
  assert.equal(storage.getItem(COMMERCE_KEY), canonicalRaw(candidateState))
  assert.equal((await readLocalCommerceSyncIntents()).length, 0)
}))

test('recovery never overwrites a diverged workspace and keeps the intent pending', () => withOutbox(async () => {
  const divergedRaw = canonicalRaw(divergedState)
  const storage = memoryStorage([[COMMERCE_KEY, divergedRaw]])
  await stageLocalCommerceSyncIntent(stageInput())
  const status = await recoverLocalCommerceSyncOutbox(storage, serialLocks())
  assert.equal(status.status, 'conflict')
  assert.equal(status.conflictCount, 1)
  assert.equal(status.recoveredCount, 0)
  assert.equal(status.replayedCount, 0)
  assert.equal(status.pendingCount, 1)
  assert.match(status.message, /Nothing was overwritten/)
  assert.equal(storage.getItem(COMMERCE_KEY), divergedRaw)
  assert.equal((await readLocalCommerceSyncIntents()).length, 1)
}))

test('recovery fails closed when no current workspace exists', () => withOutbox(async () => {
  const storage = memoryStorage()
  await stageLocalCommerceSyncIntent(stageInput())
  await assert.rejects(
    () => recoverLocalCommerceSyncOutbox(storage, serialLocks()),
    /found no current workspace/,
  )
  assert.equal(storage.entries().length, 0)
  assert.equal((await readLocalCommerceSyncIntents()).length, 1)
}))

test('recovery with nothing pending is ready without taking the workspace lock', () => withOutbox(async () => {
  await stageLocalCommerceSyncIntent(stageInput())
  await acknowledgeLocalCommerceSyncIntent('CMD-OUTBOX-1')
  const locks = serialLocks()
  const status = await recoverLocalCommerceSyncOutbox(memoryStorage(), locks)
  assert.equal(status.status, 'ready')
  assert.equal(status.pendingCount, 0)
  assert.equal(locks.requests, 0)
}))

test('recovery requires safe storage and a write lock manager', () => withOutbox(async () => {
  await assert.rejects(() => recoverLocalCommerceSyncOutbox(null, serialLocks()), /write locking are unavailable/)
  await assert.rejects(() => recoverLocalCommerceSyncOutbox(memoryStorage(), {}), /write locking are unavailable/)
}))

test('staging rejects invalid event types and malformed evidence', () => withOutbox(async () => {
  await assert.rejects(() => stageLocalCommerceSyncIntent(stageInput({ eventType: 'not-commerce.event' })), /event type is invalid/)
  await assert.rejects(
    () => stageLocalCommerceSyncIntent(stageInput({ evidence: { ...proof(), extra: 'field' } })),
    /evidence is invalid/,
  )
  const { reason, ...incomplete } = proof()
  await assert.rejects(() => stageLocalCommerceSyncIntent(stageInput({ evidence: incomplete })), /evidence is invalid/)
  assert.equal((await readLocalCommerceSyncIntents()).length, 0)
}))

test('pending outbox is bounded so unrecovered changes cannot grow without review', () => withOutbox(async () => {
  for (let index = 0; index < COMMERCE_SYNC_MAX_PENDING; index += 1) {
    const staged = await stageLocalCommerceSyncIntent(stageInput({ commandId: `CMD-OUTBOX-${index}` }))
    assert.equal(staged.status, 'staged')
  }
  await assert.rejects(
    () => stageLocalCommerceSyncIntent(stageInput({ commandId: 'CMD-OUTBOX-OVERFLOW' })),
    new RegExp(`${COMMERCE_SYNC_MAX_PENDING} pending recovery records`),
  )
  assert.equal((await readLocalCommerceSyncIntents()).length, COMMERCE_SYNC_MAX_PENDING)
}))

// A 'blocked' open must not orphan the connection the request still produces.
//
// An IDBOpenDBRequest cannot be cancelled. When another tab holds an older
// connection, an upgrading open() fires 'blocked' — and then, once that tab
// closes, the SAME request still completes and fires 'success' with a live
// IDBDatabase. openSyncDatabase rejects on 'blocked', so its resolve() in
// onsuccess is a no-op: without an explicit close, nobody ever receives that
// connection and nobody closes it. An open connection is exactly what blocks
// the NEXT version change, so one blocked open could wedge Shop recovery — the
// path that protects staged commerce writes — for the rest of the page's life.
// Regression pin for the leak Codex flagged on PR #490 (found in
// product-image-store.ts, present here on main by the same shape).
test('a blocked database open closes the connection it still receives', async () => {
  const factory = createFakeIndexedDbFactory({ blockFirstOpen: true })
  const restore = replaceGlobal('indexedDB', factory)
  try {
    await assert.rejects(() => readLocalCommerceSyncIntents(), /blocked the Shop sync database upgrade/)
    // Let the request run to completion the way a real one does after the
    // blocking tab closes: onsuccess fires on the already-rejected request.
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(
      factory.closedConnections.length,
      1,
      'the late connection must be closed, or it blocks every future upgrade until page unload',
    )
  } finally {
    restore()
  }
})
