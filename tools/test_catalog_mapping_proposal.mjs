import test from 'node:test'
import assert from 'node:assert/strict'
import { createShopCatalogImportPreview } from '../showroom/src/core/shop-catalog-import.ts'
import { reviewCatalogMappingProposal } from '../showroom/src/core/catalog-mapping-proposal.ts'

const csv = 'sku,name,stock,reorder_at,amount\nSYN-1,Synthetic item,5,1,1200'
async function proposalFor(source = csv) {
  const base = await createShopCatalogImportPreview(source, [])
  return { sourceDigest: base.sourceDigest, mapping: { sku: 'sku', name: 'name', onHand: 'stock', reorderAt: 'reorder_at', price: 'amount' } }
}
test('mapping suggestion preserves exact values and grants no write authority', async () => {
  const result = await reviewCatalogMappingProposal(csv, [], await proposalFor())
  assert.equal(result.status, 'review_required')
  assert.equal(result.importAuthorized, false)
  assert.deepEqual(result.preview.rows[0].item, { sku: 'SYN-1', name: 'Synthetic item', onHand: 5, reorderAt: 1, price: 1200 })
})
test('stale source and added values are rejected', async () => {
  const p = await proposalFor()
  assert.equal((await reviewCatalogMappingProposal(csv.replace('1200', '1300'), [], p)).reason, 'source_changed')
  assert.equal((await reviewCatalogMappingProposal(csv, [], { ...p, values: { price: 1 } })).reason, 'unexpected_proposal_field')
})
test('model cannot resolve competing quantity columns', async () => {
  const source = csv.replace('stock,reorder_at', 'stock,quantity,reorder_at').replace(',5,1,', ',5,50,1,')
  assert.equal((await reviewCatalogMappingProposal(source, [], await proposalFor(source))).reason, 'human_choice_required')
})
test('mapped foreign currency still fails deterministic validation', async () => {
  const source = csv.replace('amount', 'price_usd')
  const p = await proposalFor(source); p.mapping.price = 'price_usd'
  assert.equal((await reviewCatalogMappingProposal(source, [], p)).reason, 'import_validation_failed')
})

test('evaluation refuses incomplete or duplicated case coverage and preserves evidence limits', async () => {
  const { evaluateCatalogMappings } = await import('./evaluate_catalog_mapping.mjs')
  const corpus = { cases: [{ id: 'mapping', csv, ready: 1, values: { price: '1200', onHand: '5' } }] }
  await assert.rejects(evaluateCatalogMappings(corpus, []), /exact_case_coverage/)
  const row = { id: 'mapping', proposal: await proposalFor() }
  await assert.rejects(evaluateCatalogMappings(corpus, [row, row]), /exact_case_coverage/)
  const result = await evaluateCatalogMappings(corpus, [row])
  assert.equal(result.technicalPass, true)
  assert.equal(result.adoptionApproved, false)
  assert.equal(result.operatorTimeSavings, null)
  assert.equal(result.importExecuted, false)
  const rejected = await evaluateCatalogMappings(corpus, [{ id: 'mapping', proposal: null }])
  assert.equal(rejected.technicalPass, false)
})


test('cafe spreadsheet headings map automatically without changing values', async () => {
  const source = 'Item code,Menu item,Stock on hand,Reorder level,Selling price MMK\nCAFE-1,Espresso,12,3,3500'
  const result = await createShopCatalogImportPreview(source, [])
  assert.equal(result.totals.ready, 1)
  assert.deepEqual(result.rows[0].item, { sku: 'CAFE-1', name: 'Espresso', onHand: 12, reorderAt: 3, price: 3500 })
  assert.equal(result.mapping.name, 'Menu item')
  assert.equal(result.mapping.price, 'Selling price MMK')
})

test('competing cafe price columns still need an explicit choice', async () => {
  const source = 'Item code,Item,Stock on hand,Reorder level,Selling price MMK,Unit price MMK\nCAFE-1,Espresso,12,3,3500,3000'
  const result = await createShopCatalogImportPreview(source, [])
  assert.equal(result.mapping.price, '')
  assert.equal(result.suggestions.find(row => row.field === 'price').basis, 'ambiguous')
  assert.equal(result.totals.ready, 0)
})

test('recognized cafe headings do not bypass declared foreign currency', async () => {
  const source = 'Item code,Menu item,Stock on hand,Reorder level,Selling price MMK,Currency\nCAFE-1,Espresso,12,3,3500,THB'
  const result = await createShopCatalogImportPreview(source, [])
  assert.equal(result.totals.ready, 0)
  assert.ok(result.rows[0].issues.some(issue => issue.code === 'unsupported_currency'))
})
