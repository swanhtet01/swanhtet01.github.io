import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const { decideShopNextAction } = await import(
  pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'shop-next-action.ts')).href
)

const base = {
  actionOrderCount: 0,
  activePurchaseOrderCount: 0,
  canWrite: true,
  catalogItemCount: 10,
  inventoryReady: true,
  lowStockCount: 0,
  pendingAction: false,
  pendingOnlineRequestCount: 0,
}

test('invalid counts throw before any decision is made', () => {
  assert.throws(() => decideShopNextAction({ ...base, actionOrderCount: -1 }), /non-negative safe integers/)
  assert.throws(() => decideShopNextAction({ ...base, lowStockCount: NaN }), /non-negative safe integers/)
  assert.throws(() => decideShopNextAction({ ...base, pendingOnlineRequestCount: 1.5 }), /non-negative safe integers/)
})

test('canWrite=false → Restore Shop readiness regardless of other flags', () => {
  const result = decideShopNextAction({ ...base, canWrite: false, pendingAction: true, catalogItemCount: 0 })
  assert.equal(result.job, 'Restore Shop write readiness')
  assert.equal(result.path, '/settings/#controls')
  assert.equal(result.track, 'Review')
})

test('pendingAction=true → Approve pending Shop change (outranks empty catalog)', () => {
  const result = decideShopNextAction({ ...base, pendingAction: true, catalogItemCount: 0 })
  assert.equal(result.job, 'Approve pending Shop change')
  assert.equal(result.path, '/shop/?tab=orders')
  assert.equal(result.track, 'Review')
})

test('catalogItemCount=0 → Import your first products', () => {
  const result = decideShopNextAction({ ...base, catalogItemCount: 0 })
  assert.equal(result.job, 'Import your first products')
  assert.equal(result.path, '/shop/?tab=inventory#shop-catalog-import')
  assert.equal(result.nextAction, 'Open catalog import')
  assert.equal(result.track, 'Inventory')
})

test('pendingOnlineRequestCount > 0 → Review online order requests', () => {
  const result = decideShopNextAction({ ...base, pendingOnlineRequestCount: 3 })
  assert.equal(result.job, 'Review online order requests')
  assert.equal(result.path, '/shop/?tab=orders')
  assert.equal(result.track, 'Orders')
  assert.ok(result.reason.startsWith('3 online requests'), `reason: ${result.reason}`)
})

test('actionOrderCount > 0 → Finish fulfilment queue (outranks low-stock)', () => {
  const result = decideShopNextAction({ ...base, actionOrderCount: 2, lowStockCount: 5 })
  assert.equal(result.job, 'Finish fulfilment queue')
  assert.equal(result.path, '/shop/?tab=orders')
  assert.equal(result.track, 'Orders')
})

test('activePurchaseOrderCount > 0 → Receive purchase orders', () => {
  const result = decideShopNextAction({ ...base, activePurchaseOrderCount: 1 })
  assert.equal(result.job, 'Receive purchase orders')
  assert.equal(result.nextAction, 'Open receiving queue')
  assert.equal(result.path, '/shop/?tab=inventory')
  assert.equal(result.track, 'Inventory')
  assert.ok(result.reason.startsWith('1 purchase order '), `reason: ${result.reason}`)
})

test('lowStockCount > 0 → Reorder low stock', () => {
  const result = decideShopNextAction({ ...base, lowStockCount: 4 })
  assert.equal(result.job, 'Reorder low stock')
  assert.equal(result.path, '/shop/?tab=inventory')
  assert.equal(result.track, 'Inventory')
  assert.ok(result.reason.startsWith('4 SKUs'), `reason: ${result.reason}`)
})

test('inventoryReady=false → Set up stock locations', () => {
  const result = decideShopNextAction({ ...base, inventoryReady: false })
  assert.equal(result.job, 'Set up stock locations')
  assert.equal(result.path, '/shop/?tab=inventory')
  assert.equal(result.track, 'Inventory')
})

test('all clear → Open counter for next sale', () => {
  const result = decideShopNextAction(base)
  assert.equal(result.job, 'Open counter for next sale')
  assert.equal(result.path, '/shop/?tab=counter')
  assert.equal(result.track, 'Counter')
})
