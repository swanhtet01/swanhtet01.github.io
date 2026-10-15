import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClientImportPreview } from '../showroom/src/core/client-onboarding.ts'

const corpus = JSON.parse(readFileSync(new URL('./catalog_mapping_corpus.json', import.meta.url), 'utf8'))
assert.equal(corpus.provenance, 'synthetic')
for (const scenario of corpus.cases) {
  test(`catalog mapping baseline: ${scenario.id}`, async () => {
    const result = await createClientImportPreview(scenario.csv, 'commerce')
    assert.equal(result.rows.filter(row => row.status === 'ready').length, scenario.ready)
    if (scenario.ambiguous) {
      assert.equal(result.mapping[scenario.ambiguous], '')
      assert.equal(result.suggestions.find(item => item.field === scenario.ambiguous).basis, 'ambiguous')
    }
    for (const [field, value] of Object.entries(scenario.values ?? {})) {
      assert.equal(result.rows[0].values[field], value)
    }
  })
}

for (const header of ['price_usd', 'Unit price (THB)', 'EUR price', 'Price $', 'Price ₫', 'Price ₱', 'Price ₭', 'Price ៛', 'Price ₦', 'Price ﹩', 'Price ＄']) {
  test(`manual price mapping cannot discard currency: ${header}`, async () => {
    const result = await createClientImportPreview(`sku,name,stock,reorder_at,${header}\nSYN-FX,Synthetic item,5,1,1200`, 'commerce', {
      sku: 'sku', name: 'name', onHand: 'stock', reorderAt: 'reorder_at', price: header,
    })
    assert.equal(result.readyForStaging, false)
    assert.equal(result.rows[0].status, 'invalid')
    assert.ok(result.rows[0].issues.some(issue => issue.code === 'unsupported_currency'))
    assert.equal(result.rows[0].values.price, '1200')
  })
}

for (const header of ['Price (MMK)', 'Price (Ks)', 'Unit price']) {
  test(`MMK-compatible price mapping remains available: ${header}`, async () => {
    const result = await createClientImportPreview(`sku,name,stock,reorder_at,${header}\nSYN-MMK,Synthetic item,5,1,1200`, 'commerce', {
      sku: 'sku', name: 'name', onHand: 'stock', reorderAt: 'reorder_at', price: header,
    })
    assert.equal(result.readyForStaging, true)
    assert.equal(result.rows[0].values.price, '1200')
  })
}
