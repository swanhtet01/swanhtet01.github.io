import assert from 'node:assert/strict'
import test from 'node:test'
import { prioritizeShopTodayProducts } from '../showroom/src/core/shop-today-priority.ts'

test('Today shows out-of-stock and at-reorder products before healthy catalog rows', () => {
  const products = [
    { sku: 'A', onHand: 12, reorderAt: 5 },
    { sku: 'B', onHand: 0, reorderAt: 4 },
    { sku: 'C', onHand: 5, reorderAt: 5 },
    { sku: 'D', onHand: 20, reorderAt: 8 },
    { sku: 'E', onHand: 3, reorderAt: 5 },
    { sku: 'F', onHand: 18, reorderAt: 4 },
    { sku: 'G', onHand: 30, reorderAt: 10 },
  ]

  assert.deepEqual(
    prioritizeShopTodayProducts(products).map(({ sku }) => sku),
    ['B', 'C', 'E', 'A', 'D', 'F', 'G'],
  )
  assert.deepEqual(products.map(({ sku }) => sku), ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
})

test('Today preserves catalog order when no products need reordering', () => {
  const products = [
    { sku: 'A', onHand: 10, reorderAt: 2 },
    { sku: 'B', onHand: 15, reorderAt: 3 },
  ]

  assert.deepEqual(prioritizeShopTodayProducts(products), products)
  assert.deepEqual(prioritizeShopTodayProducts([]), [])
})
