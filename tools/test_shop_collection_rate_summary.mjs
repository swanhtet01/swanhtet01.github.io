// Shop collection rate summary: totalOrdersRequiringPayment, totalOrdersReconciled, collectionRate, amounts.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCollectionRateSummary } from './shop-collection-rate-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-collection-rate-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopCollectionRateSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function order({ id = 'ORD-1', paymentStatus = 'pending', total = 10000 } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus, refundStatus: 'none', total, status: 'confirmed',
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state
{
  const r = projectShopCollectionRateSummary(state([]))
  check(r.totalOrdersRequiringPayment === 0, 'empty: totalOrdersRequiringPayment 0')
  check(r.totalOrdersReconciled === 0, 'empty: totalOrdersReconciled 0')
  check(r.collectionRate === 0, 'empty: collectionRate 0')
  check(r.totalOutstandingAmountMmk === 0, 'empty: totalOutstandingAmountMmk 0')
  check(r.totalReconciledAmountMmk === 0, 'empty: totalReconciledAmountMmk 0')
}

// 2. Two pending orders → collectionRate 0
{
  const r = projectShopCollectionRateSummary(state([
    order({ id: 'ORD-1', paymentStatus: 'pending', total: 10000 }),
    order({ id: 'ORD-2', paymentStatus: 'pending', total: 20000 }),
  ]))
  check(r.totalOrdersRequiringPayment === 2, 'all-pending: totalOrdersRequiringPayment 2')
  check(r.totalOrdersReconciled === 0, 'all-pending: totalOrdersReconciled 0')
  check(r.collectionRate === 0, 'all-pending: collectionRate 0')
  check(r.totalOutstandingAmountMmk === 30000, 'all-pending: totalOutstandingAmountMmk 30000')
  check(r.totalReconciledAmountMmk === 0, 'all-pending: totalReconciledAmountMmk 0')
}

// 3. Two reconciled orders → collectionRate 100
{
  const r = projectShopCollectionRateSummary(state([
    order({ id: 'ORD-1', paymentStatus: 'reconciled', total: 15000 }),
    order({ id: 'ORD-2', paymentStatus: 'reconciled', total: 25000 }),
  ]))
  check(r.totalOrdersReconciled === 2, 'all-rec: totalOrdersReconciled 2')
  check(r.collectionRate === 100, 'all-rec: collectionRate 100')
}

// 4. Half and half → collectionRate 50
{
  const r = projectShopCollectionRateSummary(state([
    order({ id: 'ORD-1', paymentStatus: 'pending', total: 10000 }),
    order({ id: 'ORD-2', paymentStatus: 'reconciled', total: 10000 }),
  ]))
  check(r.collectionRate === 50, 'half: collectionRate 50')
  check(r.totalOrdersRequiringPayment === 1, 'half: totalOrdersRequiringPayment 1')
  check(r.totalOrdersReconciled === 1, 'half: totalOrdersReconciled 1')
}

// 5. Financial totals correctly split
{
  const r = projectShopCollectionRateSummary(state([
    order({ id: 'ORD-1', paymentStatus: 'pending', total: 8000 }),
    order({ id: 'ORD-2', paymentStatus: 'reconciled', total: 12000 }),
    order({ id: 'ORD-3', paymentStatus: 'pending', total: 5000 }),
  ]))
  check(r.totalOutstandingAmountMmk === 13000, 'totals: totalOutstandingAmountMmk 13000')
  check(r.totalReconciledAmountMmk === 12000, 'totals: totalReconciledAmountMmk 12000')
}

// 6. collectionRate rounds correctly (2/3 = 66.6 → 67)
{
  const r = projectShopCollectionRateSummary(state([
    order({ id: 'ORD-1', paymentStatus: 'reconciled', total: 10000 }),
    order({ id: 'ORD-2', paymentStatus: 'reconciled', total: 10000 }),
    order({ id: 'ORD-3', paymentStatus: 'pending', total: 10000 }),
  ]))
  check(r.collectionRate === 67, 'round: collectionRate 67 (round(2/3 × 100))')
}

// 7. 75% rate (3 reconciled, 1 pending)
{
  const r = projectShopCollectionRateSummary(state([
    order({ id: 'ORD-1', paymentStatus: 'reconciled', total: 10000 }),
    order({ id: 'ORD-2', paymentStatus: 'reconciled', total: 10000 }),
    order({ id: 'ORD-3', paymentStatus: 'reconciled', total: 10000 }),
    order({ id: 'ORD-4', paymentStatus: 'pending', total: 10000 }),
  ]))
  check(r.collectionRate === 75, '75pct: collectionRate 75')
}

console.log(JSON.stringify({ ok: true, checks }))
