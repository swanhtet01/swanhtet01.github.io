import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildReferencePreview,
  encodeReferenceCsv,
} from './shop_operational_export_reference.mjs'

const base = JSON.parse(readFileSync(
  new URL('./shop_operational_export_reference.fixture.json', import.meta.url),
  'utf8',
))

function withZeroPriceSale() {
  const snapshot = structuredClone(base)
  snapshot.shift.cashSalesCount += 1
  snapshot.sales.push({
    id: '999100',
    paymentMethod: 'cash',
    totalMmk: 0,
    createdAtMillis: 1792865250000,
    lines: [{
      id: '999100-1', productId: '999001', productName: 'Zero-price test item',
      quantity: 1, unitPriceMmk: 0, lineTotalMmk: 0,
    }],
  })
  snapshot.stockMovements.push({
    id: '999300', saleId: '999100', productId: '999001', quantityDelta: -1,
    reason: 'cash_sale', createdAtMillis: 1792865250000,
  })
  return snapshot
}

function withZeroPriceCorrection() {
  const snapshot = withZeroPriceSale()
  snapshot.shift.cashReversalCount += 1
  snapshot.reversals.push({
    id: '999200', saleId: '999100', originalPaymentMethod: 'cash',
    originalTotalMmk: 0, cashDrawerDeltaMmk: 0,
    reason: 'Fictional correction', authorizedActorLabel: 'Fictional operator',
    createdAtMillis: 1792865450000,
    lines: [{
      id: '999200-1', productId: '999001', productName: 'Zero-price test item',
      quantity: 1, unitPriceMmk: 0, lineTotalMmk: 0, restockQuantity: 1,
    }],
  })
  snapshot.stockMovements.push({
    id: '999301', saleId: '999100', productId: '999001', quantityDelta: 1,
    reason: 'sale_reversal_restock', createdAtMillis: 1792865450000,
  })
  return snapshot
}

test('zero-price sale remains valid, but a sale without lines is refused', () => {
  const valid = withZeroPriceSale()
  const rows = encodeReferenceCsv(valid).rows
  assert.equal(rows.filter(row => row.row_type === 'sale' && row.event_id === '999100').length, 1)
  assert.equal(rows.filter(row => row.row_type === 'sale_line' && row.event_id === '999100-1').length, 1)
  assert.equal(rows.filter(row => row.row_type === 'stock_movement' && row.event_id === '999300').length, 1)
  assert.equal(buildReferencePreview(valid, 'en').values.grossMmk, 8000)

  const incomplete = structuredClone(valid)
  incomplete.sales.at(-1).lines = []
  assert.throws(() => encodeReferenceCsv(incomplete), { message: 'reference_sale_lines_required' })
  assert.throws(() => buildReferencePreview(incomplete, 'en'), { message: 'reference_sale_lines_required' })
})

test('zero-price correction remains valid, but a reversal without lines is refused', () => {
  const valid = withZeroPriceCorrection()
  const rows = encodeReferenceCsv(valid).rows
  assert.equal(rows.filter(row => row.row_type === 'reversal' && row.event_id === '999200').length, 1)
  assert.equal(rows.filter(row => row.row_type === 'reversal_line' && row.event_id === '999200-1').length, 1)
  assert.equal(rows.filter(row => row.row_type === 'stock_movement' && row.event_id === '999301').length, 1)
  assert.equal(buildReferencePreview(valid, 'en').values.reversalMmk, 8000)

  const incomplete = structuredClone(valid)
  incomplete.reversals.at(-1).lines = []
  assert.throws(() => encodeReferenceCsv(incomplete), { message: 'reference_reversal_lines_required' })
  assert.throws(() => buildReferencePreview(incomplete, 'en'), { message: 'reference_reversal_lines_required' })
})
