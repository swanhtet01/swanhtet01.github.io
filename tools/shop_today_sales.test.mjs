import assert from 'node:assert/strict'
import test from 'node:test'
import { hasShopTodaySalesPattern, projectShopTodayCompletedSales, projectShopTodaySalesPulse } from '../showroom/src/core/shop-today-sales.ts'

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

test('sales pulse groups retained completions into Yangon three-hour periods and compares the previous day', () => {
  const commerce = { movements: [], orders: [
    order('TODAY-00', { total: 20_000, completion: { actionId: 'ACT-T0', capturedAt: '2026-10-01T17:45:00.000Z', evidenceReference: 'R-T0' } }),
    order('TODAY-09', { total: 30_000, completion: { actionId: 'ACT-T9', capturedAt: '2026-10-02T03:00:00.000Z', evidenceReference: 'R-T9' } }),
    order('PREVIOUS', { total: 40_000, completion: { actionId: 'ACT-P', capturedAt: '2026-10-01T03:00:00.000Z', evidenceReference: 'R-P' } }),
    order('SETUP-SAMPLE-PULSE', { total: 900_000, completion: { actionId: 'ACT-S', capturedAt: '2026-10-02T03:00:00.000Z', evidenceReference: 'R-S' } }),
  ] }

  const pulse = projectShopTodaySalesPulse(commerce, now)
  assert.deepEqual(pulse.today, { count: 2, grossMmk: 50_000 })
  assert.deepEqual(pulse.previous, { count: 1, grossMmk: 40_000 })
  assert.equal(pulse.deltaBasisPoints, 2_500)
  assert.equal(pulse.points.length, 8)
  assert.deepEqual(pulse.points.map(({ count, grossMmk }) => ({ count, grossMmk })), [
    { count: 1, grossMmk: 20_000 },
    { count: 0, grossMmk: 0 },
    { count: 0, grossMmk: 0 },
    { count: 1, grossMmk: 30_000 },
    { count: 0, grossMmk: 0 },
    { count: 0, grossMmk: 0 },
    { count: 0, grossMmk: 0 },
    { count: 0, grossMmk: 0 },
  ])
})

test('sales insight waits for repeated activity across periods before showing a time pattern', () => {
  const oneSale = projectShopTodaySalesPulse({ movements: [], orders: [
    order('ONE-SALE', { completion: { actionId: 'ACT-1', capturedAt: '2026-10-02T03:00:00.000Z', evidenceReference: 'R-1' } }),
  ] }, now)
  assert.equal(hasShopTodaySalesPattern(oneSale), false)

  const samePeriod = projectShopTodaySalesPulse({ movements: [], orders: [
    order('SAME-1', { completion: { actionId: 'ACT-1', capturedAt: '2026-10-02T03:00:00.000Z', evidenceReference: 'R-1' } }),
    order('SAME-2', { completion: { actionId: 'ACT-2', capturedAt: '2026-10-02T03:30:00.000Z', evidenceReference: 'R-2' } }),
    order('SAME-3', { completion: { actionId: 'ACT-3', capturedAt: '2026-10-02T03:45:00.000Z', evidenceReference: 'R-3' } }),
  ] }, now)
  assert.equal(hasShopTodaySalesPattern(samePeriod), false)

  const acrossPeriods = projectShopTodaySalesPulse({ movements: [], orders: [
    order('PERIOD-1', { completion: { actionId: 'ACT-1', capturedAt: '2026-10-01T17:45:00.000Z', evidenceReference: 'R-1' } }),
    order('PERIOD-2', { completion: { actionId: 'ACT-2', capturedAt: '2026-10-02T03:00:00.000Z', evidenceReference: 'R-2' } }),
    order('PERIOD-3', { completion: { actionId: 'ACT-3', capturedAt: '2026-10-02T03:30:00.000Z', evidenceReference: 'R-3' } }),
  ] }, now)
  assert.equal(hasShopTodaySalesPattern(acrossPeriods), true)
})
