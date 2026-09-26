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
