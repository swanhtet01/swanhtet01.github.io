import assert from 'node:assert/strict'
import test from 'node:test'

import { activeShopCounterCategoryFilter, projectShopCounterCatalog, SHOP_COUNTER_PAGE_SIZE } from '../showroom/src/core/shop-counter-catalog-window.ts'

test('removed category choices fall back to all products after a managed refresh', () => {
  const categories = [['drinks', 'Drinks']]
  assert.deepEqual(activeShopCounterCategoryFilter({ kind: 'category', value: 'food' }, categories, false), { kind: 'all' })
  assert.deepEqual(activeShopCounterCategoryFilter({ kind: 'uncategorized' }, categories, false), { kind: 'all' })
  assert.deepEqual(activeShopCounterCategoryFilter({ kind: 'category', value: 'drinks' }, categories, false), { kind: 'category', value: 'drinks' })
})

const catalog = Array.from({ length: 101 }, (_, index) => ({
  sku: `SKU-${String(index + 1).padStart(3, '0')}`,
  name: `Product ${index + 1}`,
  nameMy: index === 100 ? 'ဆန်' : undefined,
}))

test('a large counter catalog only projects one short page while later items remain searchable', () => {
  const first = projectShopCounterCatalog(catalog, '', 0)
  assert.equal(first.rows.length, SHOP_COUNTER_PAGE_SIZE)
  assert.equal(first.total, 101)
  assert.equal(first.pageCount, 13)
  assert.equal(first.rows[0].item.sku, 'SKU-001')
  assert.equal(first.rows[0].index, 0)

  const last = projectShopCounterCatalog(catalog, '', 12)
  assert.equal(last.rows.length, 5)
  assert.equal(last.rows.at(-1).item.sku, 'SKU-101')
  assert.equal(last.rows.at(-1).index, 100)
  assert.equal(projectShopCounterCatalog(catalog, 'SKU-101', 0).rows[0].item.sku, 'SKU-101')
  assert.equal(projectShopCounterCatalog(catalog, 'ဆန်', 0).rows[0].item.sku, 'SKU-101')
})

test('a changed search or smaller catalog clamps an old page without losing results', () => {
  const narrowed = projectShopCounterCatalog(catalog, 'SKU-101', 12)
  assert.equal(narrowed.page, 0)
  assert.equal(narrowed.rows.length, 1)
  assert.equal(narrowed.rows[0].item.sku, 'SKU-101')
  const small = projectShopCounterCatalog(catalog.slice(0, 3), '', 12)
  assert.equal(small.page, 0)
  assert.equal(small.pageCount, 1)
  assert.deepEqual(small.rows.map(({ item }) => item.sku), ['SKU-001', 'SKU-002', 'SKU-003'])
})
