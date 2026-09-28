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
