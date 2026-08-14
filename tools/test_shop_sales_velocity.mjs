// Shop sales velocity: rolling 7-day and 30-day order count + revenue with trend direction.
// Tests window boundaries, cancelled exclusion, byDay grouping, trend logic, and date edges.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopSalesVelocity } from './shop-sales-velocity.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/velocity-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopSalesVelocity } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// asOf = "2026-08-11"; start7 = "2026-08-05"; start30 = "2026-07-13"
const ASOF = '2026-08-11'

function commerce(orders = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements: [], closes: [] }
}

function order({ date, total = 10000, status = 'open' }) {
  return {
    id: `ord-${date}-${total}`,
    createdAt: `${date}T08:00:00.000Z`,
    customer: 'Buyer',
    item: 'Widget',
    quantity: 1,
    payment: 'Cash',
    paymentStatus: 'unpaid',
    refundStatus: 'none',
    channel: 'counter',
    status,
    total,
  }
}

// 1. Empty state → both windows zero, trend null, byDay empty
{
  const r = projectShopSalesVelocity(commerce(), ASOF)
  check(r.last7Days.orderCount === 0, 'empty: last7 orderCount is 0')
  check(r.last7Days.revenueMmk === 0, 'empty: last7 revenueMmk is 0')
  check(r.last30Days.orderCount === 0, 'empty: last30 orderCount is 0')
  check(r.last30Days.revenueMmk === 0, 'empty: last30 revenueMmk is 0')
  check(r.velocityTrend === null, 'empty: velocityTrend is null')
  check(r.byDay.length === 0, 'empty: byDay is empty')
}

// 2. Order one day before start30 window (2026-07-12) → excluded from both
{
  const r = projectShopSalesVelocity(commerce([order({ date: '2026-07-12' })]), ASOF)
  check(r.last30Days.orderCount === 0, 'before-window: excluded from last30')
  check(r.last7Days.orderCount === 0, 'before-window: excluded from last7')
  check(r.byDay.length === 0, 'before-window: excluded from byDay')
}

// 3. Order exactly at start30 (2026-07-13) → in 30-day, NOT in 7-day
{
  const r = projectShopSalesVelocity(commerce([order({ date: '2026-07-13', total: 5000 })]), ASOF)
  check(r.last30Days.orderCount === 1, 'start30 boundary: counted in last30')
  check(r.last30Days.revenueMmk === 5000, 'start30 boundary: revenue in last30')
  check(r.last7Days.orderCount === 0, 'start30 boundary: excluded from last7')
  check(r.last7Days.revenueMmk === 0, 'start30 boundary: no revenue in last7')
  check(r.byDay.length === 1, 'start30 boundary: one byDay entry')
}

// 4. Order exactly at start7 (2026-08-05) → in both windows
{
  const r = projectShopSalesVelocity(commerce([order({ date: '2026-08-05', total: 3000 })]), ASOF)
  check(r.last7Days.orderCount === 1, 'start7 boundary: counted in last7')
  check(r.last7Days.revenueMmk === 3000, 'start7 boundary: revenue in last7')
  check(r.last30Days.orderCount === 1, 'start7 boundary: also counted in last30')
  check(r.last30Days.revenueMmk === 3000, 'start7 boundary: revenue in last30')
}

// 5. Order exactly at today (2026-08-11) → in both windows
{
  const r = projectShopSalesVelocity(commerce([order({ date: '2026-08-11', total: 8000 })]), ASOF)
  check(r.last7Days.orderCount === 1, 'today: counted in last7')
  check(r.last30Days.orderCount === 1, 'today: counted in last30')
}

// 6. Order after today (2026-08-12) → excluded
{
  const r = projectShopSalesVelocity(commerce([order({ date: '2026-08-12' })]), ASOF)
  check(r.last30Days.orderCount === 0, 'future order: excluded from last30')
}

// 7. Cancelled order excluded from both windows
{
  const r = projectShopSalesVelocity(
    commerce([order({ date: '2026-08-11', status: 'cancelled', total: 20000 })]),
    ASOF,
  )
  check(r.last7Days.orderCount === 0, 'cancelled: excluded from last7')
  check(r.last30Days.orderCount === 0, 'cancelled: excluded from last30')
}

// 8. Multiple orders same day grouped in byDay
{
  const r = projectShopSalesVelocity(
    commerce([
      order({ date: '2026-08-10', total: 4000 }),
      order({ date: '2026-08-10', total: 6000 }),
    ]),
    ASOF,
  )
  check(r.byDay.length === 1, 'same-day: one byDay entry')
  check(r.byDay[0].orderCount === 2, 'same-day: orderCount grouped')
  check(r.byDay[0].revenueMmk === 10000, 'same-day: revenue grouped')
}

// 9. byDay sorted ascending by date
{
  const r = projectShopSalesVelocity(
    commerce([
      order({ date: '2026-08-09', total: 1000 }),
      order({ date: '2026-08-07', total: 2000 }),
      order({ date: '2026-08-11', total: 3000 }),
    ]),
    ASOF,
  )
  check(r.byDay.length === 3, 'sorted: three byDay entries')
  check(r.byDay[0].date === '2026-08-07', 'sorted: earliest date first')
  check(r.byDay[2].date === '2026-08-11', 'sorted: latest date last')
}

// 10. Revenue accumulation across multiple orders
{
  const r = projectShopSalesVelocity(
    commerce([
      order({ date: '2026-08-09', total: 10000 }),
      order({ date: '2026-08-10', total: 20000 }),
      order({ date: '2026-08-11', total: 30000 }),
    ]),
    ASOF,
  )
  check(r.last7Days.revenueMmk === 60000, 'revenue: last7 accumulates correctly')
  check(r.last30Days.revenueMmk === 60000, 'revenue: last30 matches last7 when all in window')
  check(r.last7Days.orderCount === 3, 'revenue: orderCount is 3')
}

// 11. velocityTrend accelerating: high revenue in last 7 days, low early in 30-day window
{
  const orders = [
    order({ date: '2026-07-13', total: 1000 }),    // start30, outside 7-day
    order({ date: '2026-08-11', total: 50000 }),
    order({ date: '2026-08-11', total: 50000 }),
    order({ date: '2026-08-11', total: 50000 }),
    order({ date: '2026-08-11', total: 50000 }),
    order({ date: '2026-08-11', total: 50000 }),
  ]
  // rate7 = 250000/7 ≈ 35714; rate30 = 251000/30 ≈ 8367; rate7 > rate30*1.1 ✓
  const r = projectShopSalesVelocity(commerce(orders), ASOF)
  check(r.velocityTrend === 'accelerating', 'trend: accelerating when last7 rate >> last30 rate')
}

// 12. velocityTrend decelerating: high revenue early in 30-day window, low in last 7
{
  const orders = [
    order({ date: '2026-07-13', total: 50000 }),
    order({ date: '2026-07-13', total: 50000 }),
    order({ date: '2026-07-13', total: 50000 }),
    order({ date: '2026-07-13', total: 50000 }),
    order({ date: '2026-07-13', total: 50000 }),
    order({ date: '2026-08-11', total: 1000 }),    // in last7, low revenue
  ]
  // rate7 = 1000/7 ≈ 143; rate30 = 251000/30 ≈ 8367; rate7 < rate30*0.9 ✓
  const r = projectShopSalesVelocity(commerce(orders), ASOF)
  check(r.velocityTrend === 'decelerating', 'trend: decelerating when last7 rate << last30 rate')
}

// 13. velocityTrend steady: uniform rate across 30 days
{
  const orders = []
  // 1 order per day for 30 days at 1000 MMK each → rate7=1000/7, rate30=30000/30=1000 — diverges
  // Better: use equal daily rates so rate7/7 ≈ rate30/30
  // Put 7 orders in last7 (2026-08-05..2026-08-11) and 23 orders in days 8-30 from start
  // all at 1000 MMK → rate7 = 7000/7 = 1000; rate30 = 30000/30 = 1000; equal → steady
  for (let i = 0; i < 7; i++) {
    const d = new Date('2026-08-05T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    orders.push(order({ date: d.toISOString().slice(0, 10), total: 1000 }))
  }
  for (let i = 0; i < 23; i++) {
    const d = new Date('2026-07-13T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    orders.push(order({ date: d.toISOString().slice(0, 10), total: 1000 }))
  }
  const r = projectShopSalesVelocity(commerce(orders), ASOF)
  check(r.velocityTrend === 'steady', 'trend: steady when last7 rate equals last30 rate')
}

// 14. velocityTrend null when no orders in last30 window
{
  const r = projectShopSalesVelocity(
    commerce([order({ date: '2026-07-12' })]), // before window
    ASOF,
  )
  check(r.velocityTrend === null, 'trend: null when no orders in last30 window')
}

// 15. Mixed: cancelled in 7-day window, completed in 30-day → only completed counted
{
  const orders = [
    order({ date: '2026-08-10', total: 15000, status: 'completed' }),
    order({ date: '2026-08-11', total: 9000, status: 'cancelled' }),
    order({ date: '2026-07-20', total: 5000 }), // outside 7-day but inside 30-day
  ]
  const r = projectShopSalesVelocity(commerce(orders), ASOF)
  check(r.last7Days.orderCount === 1, 'mixed: only non-cancelled in 7-day counted')
  check(r.last30Days.orderCount === 2, 'mixed: non-cancelled across 30-day counted')
  check(r.last30Days.revenueMmk === 20000, 'mixed: revenue excludes cancelled')
  check(r.last7Days.revenueMmk === 15000, 'mixed: last7 revenue from completed only')
  check(r.byDay.length === 2, 'mixed: byDay has two distinct dates')
}

console.log(JSON.stringify({ ok: true, checks }))
