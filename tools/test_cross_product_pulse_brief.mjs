// Cross-product operational pulse brief: pure composition over ShopSalesVelocity,
// PlantOutputVelocity, EcommerceRequestAgeSummary, PlantIssueRateSummary.
// Tests overallPulse, ecommerceBackpressure, plantHealthStatus, and summary fields.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectCrossProductPulseBrief } from './cross-product-pulse-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/pulse-brief-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectCrossProductPulseBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function shop({ trend = 'steady', orders7 = 5, revenue7 = 50000 } = {}) {
  return {
    velocityTrend: trend,
    last7Days: { orderCount: orders7, revenueMmk: revenue7 },
    last30Days: { orderCount: 20, revenueMmk: 200000 },
    byDay: [],
  }
}

function plant({ trend = 'steady', output7 = 100 } = {}) {
  return {
    velocityTrend: trend,
    last7Days: { closedJobs: 5, totalOutput: output7, totalScrap: 0 },
    last30Days: { closedJobs: 20, totalOutput: 400, totalScrap: 0 },
    byDay: [],
  }
}

function ecommerce({ stale = 0, aging = 0, fresh = 0, pending = 0 } = {}) {
  return {
    totalPending: pending || fresh + aging + stale,
    byAge: {
      fresh: { count: fresh, totalMmk: fresh * 10000 },
      aging: { count: aging, totalMmk: aging * 10000 },
      stale: { count: stale, totalMmk: stale * 10000 },
    },
    oldestRequestAgeHours: stale > 0 ? 200 : aging > 0 ? 50 : fresh > 0 ? 5 : null,
    pendingReturnIntents: 0,
    pendingCancellationIntents: 0,
  }
}

function issues({ open = 0, resolved = 0, criticalOpen = 0, openRate = 0 } = {}) {
  return {
    totalIssues: open + resolved,
    openCount: open,
    resolvedCount: resolved,
    criticalOpenCount: criticalOpen,
    openRate,
    byKind: { quality: 0, maintenance: 0, materials: 0, operations: 0 },
    bySeverity: { critical: criticalOpen, high: 0, medium: 0, low: 0, unspecified: 0 },
    byArea: [],
  }
}

// 1. Baseline steady-state: all calm
{
  const r = projectCrossProductPulseBrief(shop(), plant(), ecommerce(), issues())
  check(r.overallPulse === 'steady', 'baseline: overallPulse is steady')
  check(r.ecommerceBackpressure === 'low', 'baseline: ecommerceBackpressure is low')
  check(r.plantHealthStatus === 'healthy', 'baseline: plantHealthStatus is healthy')
  check(r.shopTrend === 'steady', 'baseline: shopTrend is steady')
  check(r.plantTrend === 'steady', 'baseline: plantTrend is steady')
}

// 2. Both accelerating → overallPulse accelerating
{
  const r = projectCrossProductPulseBrief(shop({ trend: 'accelerating' }), plant({ trend: 'accelerating' }), ecommerce(), issues())
  check(r.overallPulse === 'accelerating', 'both-accel: overallPulse is accelerating')
}

// 3. Only shop accelerating → still steady (need both)
{
  const r = projectCrossProductPulseBrief(shop({ trend: 'accelerating' }), plant({ trend: 'steady' }), ecommerce(), issues())
  check(r.overallPulse === 'steady', 'one-accel: only one accelerating is steady')
}

// 4. Shop decelerating → decelerating
{
  const r = projectCrossProductPulseBrief(shop({ trend: 'decelerating' }), plant({ trend: 'steady' }), ecommerce(), issues())
  check(r.overallPulse === 'decelerating', 'shop-decel: overallPulse is decelerating')
}

// 5. Plant decelerating → decelerating
{
  const r = projectCrossProductPulseBrief(shop({ trend: 'steady' }), plant({ trend: 'decelerating' }), ecommerce(), issues())
  check(r.overallPulse === 'decelerating', 'plant-decel: overallPulse is decelerating')
}

// 6. Critical issue → troubled (overrides everything)
{
  const r = projectCrossProductPulseBrief(shop({ trend: 'accelerating' }), plant({ trend: 'accelerating' }), ecommerce(), issues({ open: 1, criticalOpen: 1, openRate: 100 }))
  check(r.overallPulse === 'troubled', 'critical-issue: troubled even with accelerating trends')
  check(r.plantHealthStatus === 'critical', 'critical-issue: plantHealthStatus is critical')
}

// 7. Stale ecommerce request → troubled
{
  const r = projectCrossProductPulseBrief(shop(), plant(), ecommerce({ stale: 1, pending: 1 }), issues())
  check(r.overallPulse === 'troubled', 'stale: stale request makes it troubled')
  check(r.ecommerceBackpressure === 'high', 'stale: ecommerceBackpressure is high')
}

// 8. Aging ecommerce request → moderate backpressure (not troubled)
{
  const r = projectCrossProductPulseBrief(shop(), plant(), ecommerce({ aging: 2, pending: 2 }), issues())
  check(r.ecommerceBackpressure === 'moderate', 'aging: ecommerceBackpressure is moderate')
  check(r.overallPulse === 'steady', 'aging: moderate backpressure alone is not troubled')
}

// 9. plantHealthStatus: attention when openRate > 20 and open > 0
{
  const r = projectCrossProductPulseBrief(shop(), plant(), ecommerce(), issues({ open: 3, resolved: 7, openRate: 30 }))
  check(r.plantHealthStatus === 'attention', 'attention: openRate > 20 and open > 0 is attention')
  check(r.overallPulse === 'steady', 'attention: attention alone is not troubled')
}

// 10. plantHealthStatus: healthy when openRate <= 20 (even with open issues)
{
  const r = projectCrossProductPulseBrief(shop(), plant(), ecommerce(), issues({ open: 2, resolved: 8, openRate: 20 }))
  check(r.plantHealthStatus === 'healthy', 'healthy: openRate exactly 20 is healthy')
}

// 11. summary fields pass through correctly
{
  const r = projectCrossProductPulseBrief(
    shop({ orders7: 12, revenue7: 120000 }),
    plant({ output7: 250 }),
    ecommerce({ fresh: 2, aging: 1, stale: 0, pending: 3 }),
    issues({ open: 4, criticalOpen: 0 }),
  )
  check(r.summary.shopOrdersLast7 === 12, 'summary: shopOrdersLast7 is 12')
  check(r.summary.shopRevenueLast7Mmk === 120000, 'summary: shopRevenueLast7Mmk is 120000')
  check(r.summary.plantOutputLast7 === 250, 'summary: plantOutputLast7 is 250')
  check(r.summary.ecommercePendingRequests === 3, 'summary: ecommercePendingRequests is 3')
  check(r.summary.ecommerceStaleRequests === 0, 'summary: ecommerceStaleRequests is 0')
  check(r.summary.plantOpenIssues === 4, 'summary: plantOpenIssues is 4')
  check(r.summary.plantCriticalOpenIssues === 0, 'summary: plantCriticalOpenIssues is 0')
}

// 12. null velocity trends → pulse is steady (not decelerating)
{
  const r = projectCrossProductPulseBrief(shop({ trend: null }), plant({ trend: null }), ecommerce(), issues())
  check(r.overallPulse === 'steady', 'null-trends: null trends resolve to steady')
  check(r.shopTrend === null, 'null-trends: shopTrend is null')
  check(r.plantTrend === null, 'null-trends: plantTrend is null')
}

console.log(JSON.stringify({ ok: true, checks }))
