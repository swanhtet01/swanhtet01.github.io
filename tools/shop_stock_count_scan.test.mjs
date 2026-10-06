import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { applyStockCountScan } from '../showroom/src/core/shop-stock-count-scan.ts'

const itemA = { sku: 'RICE-01' }
const itemB = { sku: 'SOAP-02' }
const locationA = { sku: 'RICE-01', stockUnitId: 'LOT-1', locationId: 'STORE-1' }

test('one scan starts a draft and repeated scans increment only that same item', () => {
  const first = applyStockCountScan(null, itemA)
  assert.equal(first.status, 'selected')
  assert.equal(first.draft.quantity, '1')

  const second = applyStockCountScan(first.draft, itemA)
  assert.equal(second.status, 'incremented')
  assert.equal(second.draft.quantity, '2')

  const third = applyStockCountScan(second.draft, itemA)
  assert.equal(third.draft.quantity, '3')
})

test('scans add to a valid operator-entered count without applying inventory', () => {
  const draft = { ...itemA, stockUnitId: '', locationId: '', quantity: '12' }
  const result = applyStockCountScan(draft, itemA)
  assert.equal(result.status, 'incremented')
  assert.equal(result.draft.quantity, '13')
  assert.deepEqual(draft, { ...itemA, stockUnitId: '', locationId: '', quantity: '12' })
})

test('a different product or location cannot replace a count already in progress', () => {
  const current = { ...locationA, quantity: '4' }
  const productSwitch = applyStockCountScan(current, itemB)
  assert.equal(productSwitch.status, 'finish-current')
  assert.equal(productSwitch.draft, current)

  const locationSwitch = applyStockCountScan(current, { ...locationA, stockUnitId: 'LOT-2' })
  assert.equal(locationSwitch.status, 'finish-current')
  assert.equal(locationSwitch.draft, current)
})

test('an empty count can change target and starts the newly scanned item at one', () => {
  const current = { ...itemA, stockUnitId: '', locationId: '', quantity: '' }
  const result = applyStockCountScan(current, itemB)
  assert.equal(result.status, 'selected')
  assert.deepEqual(result.draft, { ...itemB, stockUnitId: '', locationId: '', quantity: '1' })
})

test('invalid counts, serial duplicates, and numeric overflow fail closed', () => {
  const invalid = applyStockCountScan({ ...itemA, stockUnitId: '', locationId: '', quantity: '3x' }, itemA)
  assert.equal(invalid.status, 'invalid-current')
  assert.equal(invalid.draft.quantity, '3x')

  const serialFirst = applyStockCountScan(null, { ...locationA, serial: true })
  assert.equal(serialFirst.draft.quantity, '1')
  const serialDuplicate = applyStockCountScan(serialFirst.draft, { ...locationA, serial: true })
  assert.equal(serialDuplicate.status, 'serial-limit')
  assert.equal(serialDuplicate.draft.quantity, '1')

  const overflow = applyStockCountScan({ ...itemA, stockUnitId: '', locationId: '', quantity: String(Number.MAX_SAFE_INTEGER) }, itemA)
  assert.equal(overflow.status, 'count-overflow')
})

test('the scan helper remains a local draft transform with no write or network dependency', () => {
  const source = readFileSync(new URL('../showroom/src/core/shop-stock-count-scan.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|mutateCommerce|countCommerceStock|queueAction\(/)
})
