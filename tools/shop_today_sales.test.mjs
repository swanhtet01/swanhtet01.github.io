import assert from 'node:assert/strict'
import test from 'node:test'
import { projectShopTodayCompletedSales } from '../showroom/src/core/shop-today-sales.ts'

const now = Date.parse('2026-10-02T05:00:00.000Z')

function order(id, overrides = {}) {
  return {
    id,
    createdAt: '2026-10-01T02:00:00.000Z',
    status: 'completed',
    paymentStatus: 'reconciled',
    total: 20_000,
    completion: { actionId: `ACT-${id}`, capturedAt: '2026-10-01T18:00:00.000Z', evidenceReference: `RECEIPT-${id}` },
    ...overrides,
  }
}

test('Today counts paid completions by Yangon business day, not order creation day', () => {
  const commerce = { movements: [], orders: [
    order('PAID-1'),
    order('OPEN', { status: 'confirmed', total: 100_000, completion: undefined }),
    order('UNPAID', { paymentStatus: 'pending', total: 90_000 }),
    order('YESTERDAY', { total: 80_000, completion: { actionId: 'ACT-Y', capturedAt: '2026-10-01T16:59:59.000Z', evidenceReference: 'R-Y' } }),
  ] }
  assert.deepEqual(projectShopTodayCompletedSales(commerce, now), { count: 1, grossMmk: 20_000 })
})

test('Today excludes seeded records and stock movements that identify a sample sale', () => {
  const commerce = { movements: [
    { orderId: 'MOVEMENT-SAMPLE', actionId: 'SETUP-STOCK-1', evidenceReference: 'SETUP-1' },
  ], orders: [
    order('PAID-1'),
    order('SETUP-SAMPLE-2', { total: 200_000 }),
    order('MARKER-SAMPLE', { total: 300_000, paymentEvidenceReference: 'SEED-PAID' }),
    order('MOVEMENT-SAMPLE', { total: 400_000 }),
    order('NO-PROOF', { total: 500_000, completion: undefined }),
  ] }
  assert.deepEqual(projectShopTodayCompletedSales(commerce, now), { count: 1, grossMmk: 20_000 })
})
