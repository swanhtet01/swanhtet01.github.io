// Shop order payment reconciliation brief: paymentReconciledAt date range + paymentReconciledBy distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderPaymentReconciliationBrief } from './shop-order-payment-reconciliation-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderPaymentReconciliationBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let orderId = 0
function order({ paymentReconciledAt, paymentReconciledBy } = {}) {
  orderId++
  const obj = {
    id: `ORD-${orderId}`,
    createdAt: '2026-08-01T09:00:00Z',
    customer: 'CUST-1',
    quantity: 10,
    payment: 'cash',
    paymentStatus: 'completed',
    refundStatus: 'none',
  }
  if (paymentReconciledAt !== undefined) obj.paymentReconciledAt = paymentReconciledAt
  if (paymentReconciledBy !== undefined) obj.paymentReconciledBy = paymentReconciledBy
  return obj
}

function state(orders) {
  const base = { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
  return base
}

// 1. No orders → all zeros / nulls
{
  const r = projectShopOrderPaymentReconciliationBrief(state([]))
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.reconciledOrders === 0, 'empty: reconciledOrders 0')
  check(r.reconciliationRate === 0, 'empty: reconciliationRate 0')
  check(r.earliestReconciledAt === null, 'empty: earliestReconciledAt null')
  check(r.latestReconciledAt === null, 'empty: latestReconciledAt null')
  check(r.uniqueReconciledByActors === 0, 'empty: uniqueReconciledByActors 0')
  check(r.topReconciledByActorsByCount.length === 0, 'empty: topReconciledByActorsByCount empty')
}

// 2. Orders without paymentReconciledAt → not counted
{
  const r = projectShopOrderPaymentReconciliationBrief(state([order(), order()]))
  check(r.totalOrders === 2, 'unreconciled: totalOrders 2')
  check(r.reconciledOrders === 0, 'unreconciled: reconciledOrders 0')
  check(r.reconciliationRate === 0, 'unreconciled: reconciliationRate 0')
}

// 3. Single reconciled order → all fields populated
{
  const r = projectShopOrderPaymentReconciliationBrief(
    state([order({ paymentReconciledAt: '2026-08-05T09:00:00Z', paymentReconciledBy: 'cashier-1' })]),
  )
  check(r.totalOrders === 1, 'single: totalOrders 1')
  check(r.reconciledOrders === 1, 'single: reconciledOrders 1')
  check(r.reconciliationRate === 100, 'single: reconciliationRate 100')
  check(r.earliestReconciledAt === '2026-08-05T09:00:00Z', 'single: earliestReconciledAt')
  check(r.latestReconciledAt === '2026-08-05T09:00:00Z', 'single: latestReconciledAt')
  check(r.uniqueReconciledByActors === 1, 'single: uniqueReconciledByActors 1')
  check(r.topReconciledByActorsByCount[0]?.actor === 'cashier-1', 'single: top actor cashier-1')
}

// 4. Date ordering
{
  const r = projectShopOrderPaymentReconciliationBrief(
    state([
      order({ paymentReconciledAt: '2026-08-10T09:00:00Z' }),
      order({ paymentReconciledAt: '2026-08-01T09:00:00Z' }),
      order({ paymentReconciledAt: '2026-08-05T09:00:00Z' }),
    ]),
  )
  check(r.earliestReconciledAt === '2026-08-01T09:00:00Z', 'dates: earliest')
  check(r.latestReconciledAt === '2026-08-10T09:00:00Z', 'dates: latest')
}

// 5. Mixed reconciled/unreconciled → rate
{
  const r = projectShopOrderPaymentReconciliationBrief(
    state([
      order({ paymentReconciledAt: '2026-08-01T09:00:00Z', paymentReconciledBy: 'cashier-1' }),
      order({ paymentReconciledAt: '2026-08-02T09:00:00Z', paymentReconciledBy: 'cashier-1' }),
      order(),
      order(),
    ]),
  )
  check(r.totalOrders === 4, 'mixed: totalOrders 4')
  check(r.reconciledOrders === 2, 'mixed: reconciledOrders 2')
  check(r.reconciliationRate === 50, 'mixed: reconciliationRate 50')
  check(r.uniqueReconciledByActors === 1, 'mixed: uniqueReconciledByActors 1')
}

// 6. Actor distribution
{
  const r = projectShopOrderPaymentReconciliationBrief(
    state([
      order({ paymentReconciledAt: '2026-08-01T09:00:00Z', paymentReconciledBy: 'cashier-1' }),
      order({ paymentReconciledAt: '2026-08-02T09:00:00Z', paymentReconciledBy: 'cashier-1' }),
      order({ paymentReconciledAt: '2026-08-03T09:00:00Z', paymentReconciledBy: 'cashier-2' }),
    ]),
  )
  check(r.uniqueReconciledByActors === 2, 'actor-dist: uniqueReconciledByActors 2')
  check(r.topReconciledByActorsByCount[0]?.actor === 'cashier-1', 'actor-dist: top cashier-1')
  check(r.topReconciledByActorsByCount[0]?.count === 2, 'actor-dist: count 2')
}

// 7. Top-5 cap + tiebreak
{
  const actors = ['Z-cshr', 'A-cshr', 'C-cshr', 'B-cshr', 'D-cshr', 'E-cshr']
  const r = projectShopOrderPaymentReconciliationBrief(
    state(actors.map(a => order({ paymentReconciledAt: '2026-08-01T09:00:00Z', paymentReconciledBy: a }))),
  )
  check(r.topReconciledByActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topReconciledByActorsByCount[0]?.actor === 'A-cshr', 'top5: tiebreak A-cshr first')
}

console.log(JSON.stringify({ ok: true, checks }))
