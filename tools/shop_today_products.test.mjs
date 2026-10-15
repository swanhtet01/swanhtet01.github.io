import assert from 'node:assert/strict'
import test from 'node:test'
import { selectShopTodayProducts } from '../showroom/src/core/shop-today-products.ts'

const product = (sku, { name = sku, onHand = 8, reorderAt = 2 } = {}) => ({ name, onHand, reorderAt, sku })

test('a low-stock item later in a large catalog stays visible on Today', () => {
  const catalog = [
    ...Array.from({ length: 8 }, (_, index) => product(`normal-${index}`)),
    product('late-alert', { onHand: 0, reorderAt: 4 }),
  ]

  const selected = selectShopTodayProducts(catalog)

  assert.equal(selected.length, 6)
  assert.equal(selected[0].sku, 'late-alert')
  assert.equal(selected.some((item) => item.sku === 'late-alert'), true)
})

test('Today prioritizes the five most urgent stock alerts, then fills with normal products', () => {
  const catalog = [
    product('normal-first'),
    ...Array.from({ length: 7 }, (_, index) => product(`alert-${index + 1}`, { onHand: 0, reorderAt: index + 1 })),
    product('normal-last'),
  ]

  const selected = selectShopTodayProducts(catalog)

  assert.deepEqual(selected.map((item) => item.sku), ['alert-7', 'alert-6', 'alert-5', 'alert-4', 'alert-3', 'normal-first'])
})

test('catalog order is preserved when no products need a stock alert', () => {
  const catalog = Array.from({ length: 8 }, (_, index) => product(`normal-${index}`))

  assert.deepEqual(selectShopTodayProducts(catalog).map((item) => item.sku), [
    'normal-0', 'normal-1', 'normal-2', 'normal-3', 'normal-4', 'normal-5',
  ])
})
