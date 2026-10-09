import assert from 'node:assert/strict'
import esbuild from '../showroom/node_modules/esbuild/lib/main.js'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const built = await esbuild.build({
  entryPoints: [resolve(root, 'showroom/src/core/shop-stocktake-draft-store.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const store = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}

const draft = {
  sku: 'RICE-25', stockUnitId: 'unit-1', locationId: 'store-1', quantity: '8',
  expectedOnHand: 10, expectedPhysicalQuantity: 10, expectedHeadDigest: 'sha256:head',
}
const snapshot = { current: draft, lines: [] }

test('stocktake draft keys separate workspaces and named users', () => {
  const storage = new MemoryStorage()
  const userA = store.shopStocktakeDraftKey('["managed","workspace-a","user-a"]')
  const userB = store.shopStocktakeDraftKey('["managed","workspace-a","user-b"]')
  const workspaceB = store.shopStocktakeDraftKey('["managed","workspace-b","user-a"]')
  assert.notEqual(userA, userB)
  assert.notEqual(userA, workspaceB)
  store.persistShopStocktakeDraft(storage, userA, snapshot)
  assert.deepEqual(store.readShopStocktakeDraft(storage, userB), { status: 'missing' })
  assert.deepEqual(store.readShopStocktakeDraft(storage, workspaceB), { status: 'missing' })
})

test('missing, saved, restored and cleared drafts have explicit outcomes', () => {
  const storage = new MemoryStorage()
  const key = store.shopStocktakeDraftKey('["managed","workspace-a","user-a"]')
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'missing' })
  assert.equal(store.persistShopStocktakeDraft(storage, key, snapshot), true)
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'valid', snapshot })
  assert.equal(store.clearShopStocktakeDraft(storage, key), true)
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'missing' })
})

test('a new scope starts empty unless its own saved draft validates', () => {
  const storage = new MemoryStorage()
  const oldScope = store.shopStocktakeDraftKey('workspace-a:user-a')
  const newScope = store.shopStocktakeDraftKey('workspace-b:user-b')
  store.persistShopStocktakeDraft(storage, oldScope, snapshot)
  const read = store.readShopStocktakeDraft(storage, newScope)
  assert.deepEqual(store.shopStocktakeDraftRecovery(read), { status: 'idle' })
  storage.setItem(newScope, '{invalid}')
  assert.deepEqual(store.shopStocktakeDraftRecovery(store.readShopStocktakeDraft(storage, newScope)), { status: 'unavailable' })
  store.persistShopStocktakeDraft(storage, newScope, { current: null, lines: [] })
  assert.deepEqual(store.shopStocktakeDraftRecovery(store.readShopStocktakeDraft(storage, newScope)), { status: 'saved', snapshot: { current: null, lines: [] } })
})

test('malformed, unknown-version, duplicate and oversized drafts are rejected', () => {
  const storage = new MemoryStorage()
  const key = store.shopStocktakeDraftKey('local')
  storage.setItem(key, '{broken')
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'invalid' })
  storage.setItem(key, JSON.stringify({ version: 2, ...snapshot }))
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'invalid' })
  storage.setItem(key, JSON.stringify({ version: 1, current: null, lines: [draft] }))
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'invalid' })
  storage.setItem(key, JSON.stringify({ version: 1, current: draft, lines: Array(201).fill(draft) }))
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'invalid' })
  storage.setItem(key, JSON.stringify({ version: 1, current: draft, lines: [draft] }))
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'invalid' })
  storage.setItem(key, JSON.stringify({ version: 1, current: { ...draft, quantity: '9999999999999999' }, lines: [] }))
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'invalid' })
  storage.setItem(key, JSON.stringify({ version: 1, current: draft, lines: [{ ...draft, quantity: '' }] }))
  assert.deepEqual(store.readShopStocktakeDraft(storage, key), { status: 'invalid' })
})

test('storage exceptions fail closed without claiming a saved draft', () => {
  const denied = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  }
  const key = store.shopStocktakeDraftKey('local')
  assert.deepEqual(store.readShopStocktakeDraft(denied, key), { status: 'unavailable' })
  assert.equal(store.persistShopStocktakeDraft(denied, key, snapshot), false)
  assert.equal(store.clearShopStocktakeDraft(denied, key), false)
  assert.deepEqual(store.readShopStocktakeDraft(null, key), { status: 'unavailable' })
})
