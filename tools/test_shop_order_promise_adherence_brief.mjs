// Shop order promise adherence brief: SLA tracking via promisedAt vs completion.capturedAt.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderPromiseAdherenceBrief } from './shop-order-promise-adherence-brief.ts'`,
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

const { projectShopOrderPromiseAdherenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const AS_OF = '2026-08-11T12:00:00Z'
const PAST = '2026-08-01T00:00:00Z'       // before AS_OF
const FUTURE = '2026-08-20T00:00:00Z'     // after AS_OF

let orderId = 0
function order({ promisedAt, status, capturedAt }) {
  orderId++
  const o = { id: `ord-${orderId}`, payment: 'cash', status, total: 1000, createdAt: '2026-07-01T00:00:00Z' }
  if (promisedAt !== undefined) o.promisedAt = promisedAt
  if (capturedAt !== undefined) o.completion = { actionId: `act-${orderId}`, capturedAt, actor: 'staff-1', reason: 'completed', evidenceReference: `ev-${orderId}` }
  return o
}

function state(...orders) {
  return { schema: 'supermega.commerce.workspace.v1', revision: 1, orders, closes: [], purchaseOrders: [] }
}

// 1. Empty → all zeros
{
  const r = projectShopOrderPromiseAdherenceBrief(state(), AS_OF)
  check(r.totalOrders === 0, 'empty: totalOrders 0')
  check(r.ordersWithPromise === 0, 'empty: ordersWithPromise 0')
  check(r.ordersWithoutPromise === 0, 'empty: ordersWithoutPromise 0')
  check(r.onTimeDeliveries === 0, 'empty: onTimeDeliveries 0')
  check(r.lateDeliveries === 0, 'empty: lateDeliveries 0')
  check(r.cancelledWithPromise === 0, 'empty: cancelledWithPromise 0')
  check(r.activeOverdue === 0, 'empty: activeOverdue 0')
  check(r.activePending === 0, 'empty: activePending 0')
  check(r.onTimeRate === 0, 'empty: onTimeRate 0')
}

// 2. Order without promise → ordersWithoutPromise
{
  const r = projectShopOrderPromiseAdherenceBrief(
    state(order({ status: 'completed', capturedAt: '2026-08-05T10:00:00Z' })),
    AS_OF,
  )
  check(r.totalOrders === 1, 'no-promise: totalOrders 1')
  check(r.ordersWithoutPromise === 1, 'no-promise: ordersWithoutPromise 1')
  check(r.ordersWithPromise === 0, 'no-promise: ordersWithPromise 0')
  check(r.onTimeDeliveries === 0, 'no-promise: onTimeDeliveries 0')
}

// 3. On-time delivery — capturedAt <= promisedAt
{
  const r = projectShopOrderPromiseAdherenceBrief(
    state(order({ promisedAt: '2026-08-10T00:00:00Z', status: 'completed', capturedAt: '2026-08-09T12:00:00Z' })),
    AS_OF,
  )
  check(r.onTimeDeliveries === 1, 'on-time: onTimeDeliveries 1')
  check(r.lateDeliveries === 0, 'on-time: lateDeliveries 0')
  check(r.onTimeRate === 100, 'on-time: onTimeRate 100')
}

// 4. Late delivery — capturedAt > promisedAt
{
  const r = projectShopOrderPromiseAdherenceBrief(
    state(order({ promisedAt: '2026-08-05T00:00:00Z', status: 'completed', capturedAt: '2026-08-08T10:00:00Z' })),
    AS_OF,
  )
  check(r.lateDeliveries === 1, 'late: lateDeliveries 1')
  check(r.onTimeDeliveries === 0, 'late: onTimeDeliveries 0')
  check(r.onTimeRate === 0, 'late: onTimeRate 0 (all late)')
}

// 5. Cancelled order with promise
{
  const r = projectShopOrderPromiseAdherenceBrief(
    state(order({ promisedAt: FUTURE, status: 'cancelled' })),
    AS_OF,
  )
  check(r.cancelledWithPromise === 1, 'cancelled: cancelledWithPromise 1')
  check(r.ordersWithPromise === 1, 'cancelled: ordersWithPromise 1')
  check(r.activeOverdue === 0, 'cancelled: activeOverdue 0 (not active)')
}

// 6. Active order past promise date → activeOverdue
{
  const r = projectShopOrderPromiseAdherenceBrief(
    state(order({ promisedAt: PAST, status: 'preparing' })),
    AS_OF,
  )
  check(r.activeOverdue === 1, 'active-overdue: activeOverdue 1')
  check(r.activePending === 0, 'active-overdue: activePending 0')
  check(r.onTimeRate === 0, 'active-overdue: onTimeRate 0 (no completed)')
}

// 7. Active order with future promise date → activePending
{
  const r = projectShopOrderPromiseAdherenceBrief(
    state(order({ promisedAt: FUTURE, status: 'preparing' })),
    AS_OF,
  )
  check(r.activePending === 1, 'active-pending: activePending 1')
  check(r.activeOverdue === 0, 'active-pending: activeOverdue 0')
}

// 8. Mixed: on-time + late → 50% rate
{
  const r = projectShopOrderPromiseAdherenceBrief(state(
    order({ promisedAt: '2026-08-10T00:00:00Z', status: 'completed', capturedAt: '2026-08-09T00:00:00Z' }),
    order({ promisedAt: '2026-08-05T00:00:00Z', status: 'completed', capturedAt: '2026-08-07T00:00:00Z' }),
  ), AS_OF)
  check(r.onTimeDeliveries === 1, 'mixed-50pct: onTimeDeliveries 1')
  check(r.lateDeliveries === 1, 'mixed-50pct: lateDeliveries 1')
  check(r.onTimeRate === 50, 'mixed-50pct: onTimeRate 50')
}

// 9. onTimeRate rounds — 2 on-time of 3 = 67%
{
  const r = projectShopOrderPromiseAdherenceBrief(state(
    order({ promisedAt: '2026-08-10T00:00:00Z', status: 'completed', capturedAt: '2026-08-09T00:00:00Z' }),
    order({ promisedAt: '2026-08-10T00:00:00Z', status: 'completed', capturedAt: '2026-08-09T00:00:00Z' }),
    order({ promisedAt: '2026-08-05T00:00:00Z', status: 'completed', capturedAt: '2026-08-07T00:00:00Z' }),
  ), AS_OF)
  check(r.onTimeRate === 67, 'round-67pct: onTimeRate 67')
}

// 10. ordersWithPromise + ordersWithoutPromise = totalOrders
{
  const r = projectShopOrderPromiseAdherenceBrief(state(
    order({ promisedAt: FUTURE, status: 'preparing' }),
    order({ status: 'completed', capturedAt: '2026-08-05T00:00:00Z' }),
  ), AS_OF)
  check(r.totalOrders === 2, 'totals: totalOrders 2')
  check(r.ordersWithPromise + r.ordersWithoutPromise === r.totalOrders, 'totals: with + without = total')
}

console.log(JSON.stringify({ ok: true, checks }))
