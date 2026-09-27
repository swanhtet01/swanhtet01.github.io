import test from 'node:test'
import assert from 'node:assert/strict'
import { createClientImportPreview } from '../showroom/src/core/client-onboarding.ts'

test('competing stock aliases cannot silently choose a business quantity', async () => {
  const csv = 'sku,name,stock,quantity,reorder_at,price\nTEST-1,Synthetic item,5,50,1,1000'
  const preview = await createClientImportPreview(csv, 'commerce')
  assert.equal(preview.mapping.onHand, '')
  assert.equal(preview.suggestions.find(item => item.field === 'onHand').basis, 'ambiguous')
  assert.notEqual(preview.rows[0].status, 'ready')
  const selected = await createClientImportPreview(csv, 'commerce', { ...preview.mapping, onHand: 'quantity' })
  assert.equal(selected.rows[0].status, 'ready')
  assert.equal(selected.rows[0].values.onHand, '50')
})

test('one stock alias still maps automatically', async () => {
  const preview = await createClientImportPreview('sku,name,stock,reorder_at,price\nTEST-1,Synthetic item,5,1,1000', 'commerce')
  assert.equal(preview.mapping.onHand, 'stock')
  assert.equal(preview.rows[0].status, 'ready')
})

test('canonical field wins over aliases regardless of column order', async () => {
  for (const [headers, values] of [['stock,onHand', '50,5'], ['onHand,stock', '5,50']]) {
    const preview = await createClientImportPreview(`sku,name,${headers},reorder_at,price\nTEST-1,Synthetic item,${values},1,1000`, 'commerce')
    assert.equal(preview.mapping.onHand, 'onHand')
    assert.equal(preview.rows[0].values.onHand, '5')
  }
})

// The row-review comparison must agree with the final atomic import rule.
test('catalog comparison names changed fields without changing either item', async () => {
  const { commerceCatalogImportDifferences } = await import('../showroom/src/core/commerce-workspace.ts')
  const existing = Object.freeze({ sku: 'CHECK-1', name: 'Existing item', onHand: 5, reorderAt: 1, price: 1000 })
  assert.deepEqual(commerceCatalogImportDifferences(existing, { ...existing }), [])
  for (const [field, value] of [['name', 'Changed item'], ['variant', 'Large'], ['onHand', 6], ['reorderAt', 2], ['price', 1200]]) {
    assert.deepEqual(commerceCatalogImportDifferences(existing, Object.freeze({ ...existing, [field]: value })), [field])
  }
  assert.deepEqual(commerceCatalogImportDifferences(existing, { ...existing, price: 1200, onHand: 6 }), ['onHand', 'price'])
})

test('catalog import rejects a mixed conflicting batch without mutating existing state', async () => {
  const { createEmptyCommerce, importCommerceCatalog } = await import('../showroom/src/core/commerce-workspace.ts')
  const item = { sku: 'CHECK-1', name: 'Existing item', onHand: 5, reorderAt: 1, price: 1000 }
  const context = { sourceDigest: `sha256:${'a'.repeat(64)}`, capturedAt: '2026-09-27T00:00:00.000Z', actor: 'Synthetic tester' }
  const first = importCommerceCatalog(createEmptyCommerce(), { ...context, items: [item] })
  assert.ok(first)
  const before = JSON.stringify(first.state)
  const unchanged = importCommerceCatalog(first.state, { ...context, items: [{ ...item }] })
  assert.equal(unchanged.alreadyPresent, 1)
  assert.equal(unchanged.created, 0)
  assert.equal(importCommerceCatalog(first.state, { ...context, items: [{ ...item, sku: 'CHECK-2' }, { ...item, price: 1200 }] }), null)
  assert.equal(JSON.stringify(first.state), before)
})
