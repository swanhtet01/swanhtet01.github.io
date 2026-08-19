// Ecommerce request age summary: buckets pending requests by wait time (fresh/aging/stale).
// Tests age boundary logic, bucket accumulation, oldest-age tracking, and intent counts.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestAgeSummary, projectEcommerceStaleRequestQueue } from './ecommerce-request-age-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ecommerce-age-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectEcommerceRequestAgeSummary, projectEcommerceStaleRequestQueue } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// asOf = "2026-08-11T12:00:00.000Z"
// fresh: < 24h (< 1440 min; ageHours < 24)
// aging: 24h–167h (1–6.9 days; ageHours 24–167)
// stale: ≥ 168h (≥ 7 days; ageHours ≥ 168)
const ASOF = '2026-08-11T12:00:00.000Z'

function req({ hoursAgo, totalMmk = 10000, fulfilment = 'pickup' }) {
  const ms = Date.parse(ASOF) - hoursAgo * 3600 * 1000
  return {
    schema: 'supermega.ecommerce.order_request.v2',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    scope: 's1',
    id: `req-${hoursAgo}`,
    idempotencyKey: `key-${hoursAgo}`,
    createdAt: new Date(ms).toISOString(),
    sourcePreviewDigest: 'abc',
    sourceStorefrontRevision: 1,
    sourceStorefrontActionId: 'a1',
    customerReference: 'Customer A',
    fulfilment,
    currency: 'MMK',
    lines: [],
    quote: {},
    totalMmk,
  }
}

function state({ requests = [], returnIntents = [], cancellationIntents = [], cancellationDecisions = [] } = {}) {
  return {
    schema: 'supermega.ecommerce.buying_lifecycle.v1',
    scope: 's1',
    revision: 1,
    headDigest: 'x',
    requests,
    returnIntents,
    supportIntents: [],
    correctionIntents: [],
    cancellationIntents,
    cancellationDecisions,
    amendmentIntents: [],
  }
}

// 1. Empty state → all zeros, oldestRequestAgeHours null
{
  const r = projectEcommerceRequestAgeSummary(state(), ASOF)
  check(r.totalPending === 0, 'empty: totalPending is 0')
  check(r.byAge.fresh.count === 0, 'empty: fresh count is 0')
  check(r.byAge.aging.count === 0, 'empty: aging count is 0')
  check(r.byAge.stale.count === 0, 'empty: stale count is 0')
  check(r.oldestRequestAgeHours === null, 'empty: oldestRequestAgeHours is null')
  check(r.pendingReturnIntents === 0, 'empty: pendingReturnIntents is 0')
  check(r.pendingCancellationIntents === 0, 'empty: pendingCancellationIntents is 0')
}

// 2. Single fresh request (1 hour ago)
{
  const r = projectEcommerceRequestAgeSummary(state({ requests: [req({ hoursAgo: 1 })] }), ASOF)
  check(r.totalPending === 1, 'fresh: totalPending is 1')
  check(r.byAge.fresh.count === 1, 'fresh: counted in fresh bucket')
  check(r.byAge.fresh.totalMmk === 10000, 'fresh: totalMmk correct')
  check(r.byAge.aging.count === 0, 'fresh: not in aging bucket')
  check(r.byAge.stale.count === 0, 'fresh: not in stale bucket')
}

// 3. Request exactly at 24-hour boundary → aging (not fresh, ageHours = 24)
{
  const r = projectEcommerceRequestAgeSummary(state({ requests: [req({ hoursAgo: 24 })] }), ASOF)
  check(r.byAge.fresh.count === 0, '24h boundary: not in fresh')
  check(r.byAge.aging.count === 1, '24h boundary: in aging bucket')
}

// 4. Aging request (3 days = 72 hours ago)
{
  const r = projectEcommerceRequestAgeSummary(state({ requests: [req({ hoursAgo: 72, totalMmk: 25000 })] }), ASOF)
  check(r.byAge.aging.count === 1, 'aging: counted in aging bucket')
  check(r.byAge.aging.totalMmk === 25000, 'aging: totalMmk correct')
  check(r.byAge.stale.count === 0, 'aging: not in stale bucket')
}

// 5. Request exactly at 168-hour boundary (7 days) → stale (ageHours = 168)
{
  const r = projectEcommerceRequestAgeSummary(state({ requests: [req({ hoursAgo: 168 })] }), ASOF)
  check(r.byAge.aging.count === 0, '168h boundary: not in aging')
  check(r.byAge.stale.count === 1, '168h boundary: in stale bucket')
}

// 6. Very old stale request (20 days = 480 hours)
{
  const r = projectEcommerceRequestAgeSummary(state({ requests: [req({ hoursAgo: 480, totalMmk: 50000 })] }), ASOF)
  check(r.byAge.stale.count === 1, 'stale: counted in stale bucket')
  check(r.byAge.stale.totalMmk === 50000, 'stale: totalMmk correct')
}

// 7. oldestRequestAgeHours tracks maximum age
{
  const requests = [req({ hoursAgo: 5 }), req({ hoursAgo: 200 }), req({ hoursAgo: 36 })]
  const r = projectEcommerceRequestAgeSummary(state({ requests }), ASOF)
  check(r.oldestRequestAgeHours === 200, 'oldest: tracks maximum age across requests')
  check(r.byAge.stale.count === 1, 'oldest: stale bucket has the 200h request')
}

// 8. Multiple requests in same bucket accumulate value
{
  const requests = [req({ hoursAgo: 2, totalMmk: 5000 }), req({ hoursAgo: 10, totalMmk: 15000 })]
  const r = projectEcommerceRequestAgeSummary(state({ requests }), ASOF)
  check(r.byAge.fresh.count === 2, 'accumulate: two requests in fresh')
  check(r.byAge.fresh.totalMmk === 20000, 'accumulate: totalMmk adds across fresh requests')
  check(r.totalPending === 2, 'accumulate: totalPending is 2')
}

// 9. Mixed buckets: fresh + aging + stale
{
  const requests = [
    req({ hoursAgo: 5 }),       // fresh
    req({ hoursAgo: 48 }),      // aging
    req({ hoursAgo: 300 }),     // stale
    req({ hoursAgo: 1 }),       // fresh
    req({ hoursAgo: 100 }),     // aging
  ]
  const r = projectEcommerceRequestAgeSummary(state({ requests }), ASOF)
  check(r.byAge.fresh.count === 2, 'mixed: 2 fresh requests')
  check(r.byAge.aging.count === 2, 'mixed: 2 aging requests')
  check(r.byAge.stale.count === 1, 'mixed: 1 stale request')
  check(r.totalPending === 5, 'mixed: totalPending is 5')
  check(r.oldestRequestAgeHours === 300, 'mixed: oldestAgeHours is 300')
}

// 10. Return intents counted from returnIntents array length
{
  const r = projectEcommerceRequestAgeSummary(
    state({ returnIntents: [{ id: 'ri1' }, { id: 'ri2' }] }),
    ASOF,
  )
  check(r.pendingReturnIntents === 2, 'intents: returnIntents counted correctly')
  check(r.totalPending === 0, 'intents: totalPending unaffected by returnIntents')
}

// 11. Cancellation intents counted from cancellationIntents array length
{
  const r = projectEcommerceRequestAgeSummary(
    state({ cancellationIntents: [{ id: 'ci1' }, { id: 'ci2' }, { id: 'ci3' }] }),
    ASOF,
  )
  check(r.pendingCancellationIntents === 3, 'intents: cancellationIntents counted correctly')
}

// 12. Combined: requests + return + cancellation intents
{
  const r = projectEcommerceRequestAgeSummary(
    state({
      requests: [req({ hoursAgo: 12 }), req({ hoursAgo: 96 })],
      returnIntents: [{ id: 'ri1' }],
      cancellationIntents: [{ id: 'ci1' }, { id: 'ci2' }],
    }),
    ASOF,
  )
  check(r.totalPending === 2, 'combined: totalPending is 2')
  check(r.byAge.fresh.count === 1, 'combined: one fresh request')
  check(r.byAge.aging.count === 1, 'combined: one aging request')
  check(r.pendingReturnIntents === 1, 'combined: one return intent')
  check(r.pendingCancellationIntents === 2, 'combined: two cancellation intents')
  check(r.oldestRequestAgeHours === 96, 'combined: oldestAgeHours is 96')
}

// 13. A cancellation intent with a matching decision is excluded from pendingCancellationIntents
{
  const r = projectEcommerceRequestAgeSummary(
    state({
      cancellationIntents: [{ id: 'ci1' }],
      cancellationDecisions: [{ intentId: 'ci1' }],
    }),
    ASOF,
  )
  check(r.pendingCancellationIntents === 0, 'decided cancellation intent excluded from pending count')
}

// 14. Only the decided cancellation intent is excluded, others remain pending
{
  const r = projectEcommerceRequestAgeSummary(
    state({
      cancellationIntents: [{ id: 'ci1' }, { id: 'ci2' }],
      cancellationDecisions: [{ intentId: 'ci1' }],
    }),
    ASOF,
  )
  check(r.pendingCancellationIntents === 1, 'only the undecided cancellation intent remains pending')
}

// --- projectEcommerceStaleRequestQueue: the Shop-operator follow-up queue -----------------
// Same fresh/aging/stale boundaries as above, but returns the individual non-fresh requests
// (not just bucket counts), sorted oldest-first, for a manual-follow-up view.

// 15. Empty requests → empty queue
{
  const q = projectEcommerceStaleRequestQueue([], ASOF)
  check(Array.isArray(q) && q.length === 0, 'queue: empty requests produce an empty queue')
}

// 16. A fresh request (1 hour ago) is excluded from the queue entirely
{
  const q = projectEcommerceStaleRequestQueue([req({ hoursAgo: 1 })], ASOF)
  check(q.length === 0, 'queue: fresh request is excluded')
}

// 17. A request at the 24h boundary is included and tagged aging
{
  const q = projectEcommerceStaleRequestQueue([req({ hoursAgo: 24 })], ASOF)
  check(q.length === 1, 'queue: 24h boundary request is included')
  check(q[0].tier === 'aging', 'queue: 24h boundary request tagged aging')
  check(q[0].ageHours === 24, 'queue: 24h boundary request has ageHours 24')
}

// 18. A request at the 168h boundary is tagged stale
{
  const q = projectEcommerceStaleRequestQueue([req({ hoursAgo: 168 })], ASOF)
  check(q.length === 1, 'queue: 168h boundary request is included')
  check(q[0].tier === 'stale', 'queue: 168h boundary request tagged stale')
}

// 19. Just under the 168h boundary (167h) is still tagged aging
{
  const q = projectEcommerceStaleRequestQueue([req({ hoursAgo: 167 })], ASOF)
  check(q[0].tier === 'aging', 'queue: 167h request tagged aging, not stale')
}

// 20. Mixed ages sort oldest-first and drop the fresh entry
{
  const requests = [
    req({ hoursAgo: 5 }),    // fresh — excluded
    req({ hoursAgo: 300 }),  // stale
    req({ hoursAgo: 48 }),   // aging
    req({ hoursAgo: 500 }),  // stale, oldest
  ]
  const q = projectEcommerceStaleRequestQueue(requests, ASOF)
  check(q.length === 3, 'queue: fresh request dropped, three remain')
  check(q.map((e) => e.ageHours).join(',') === '500,300,48', 'queue: sorted oldest-first by ageHours')
  check(q[0].tier === 'stale' && q[1].tier === 'stale' && q[2].tier === 'aging', 'queue: tiers assigned per entry')
}

// 21. Each queue entry carries the fields a follow-up view needs
{
  const q = projectEcommerceStaleRequestQueue(
    [req({ hoursAgo: 200, totalMmk: 42000, fulfilment: 'delivery' })],
    ASOF,
  )
  check(q[0].id === 'req-200', 'queue: entry carries id')
  check(q[0].customerReference === 'Customer A', 'queue: entry carries customerReference')
  check(q[0].fulfilment === 'delivery', 'queue: entry carries fulfilment')
  check(q[0].totalMmk === 42000, 'queue: entry carries totalMmk')
  check(typeof q[0].createdAt === 'string', 'queue: entry carries createdAt')
}

console.log(JSON.stringify({ ok: true, checks }))
