// CEO operating brief: synthesis of all five product analytics summaries.
// Tests alert generation, passthrough of key metrics, and empty-state handling.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { projectCeoOperatingBrief } from './ceo-operating-brief.ts'
      export { COMMERCE_KEY, readCommerceWorkspace } from './commerce-workspace.ts'
      export { PRODUCTION_KEY, readProductionWorkspace } from './production-workspace.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/ceo-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { COMMERCE_KEY, PRODUCTION_KEY, projectCeoOperatingBrief, readCommerceWorkspace, readProductionWorkspace } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function makeShop({ totalRevenue = 0, orderCount = 0, completedCount = 0, cancelledCount = 0, averageOrderValue = 0 } = {}) {
  return { totalRevenue, orderCount, completedCount, cancelledCount, averageOrderValue, byChannel: {}, topSkus: [], closeSummary: [] }
}

function makePlant({ totalJobs = 0, closedJobs = 0, openJobs = 0, onHoldJobs = 0, overdueJobs = 0, qualityRate = 0, totalTarget = 0, totalGoodOutput = 0, totalScrap = 0, avgJobProgress = 0 } = {}) {
  return { asOf: '2026-08-11T09:00:00.000Z', totalJobs, closedJobs, openJobs, onHoldJobs, overdueJobs, qualityRate, totalTarget, totalGoodOutput, totalScrap, avgJobProgress, byLine: {} }
}

function makeWebsite({ totalLeads = 0, newLeads = 0, qualifiedLeads = 0, closedLeads = 0, qualificationRate = 0, closureRate = 0 } = {}) {
  return { totalLeads, newLeads, qualifiedLeads, closedLeads, qualificationRate, closureRate, bySourcePage: {} }
}

function makeEcommerce({ totalRequests = 0, totalRequestValueMmk = 0, averageRequestValueMmk = 0, pendingReturnIntents = 0, pendingCancellationIntents = 0 } = {}) {
  return { totalRequests, totalRequestValueMmk, averageRequestValueMmk, byFulfilment: {}, pendingReturnIntents, pendingCancellationIntents }
}

function makeCrm({ uniqueCustomers = 0, repeatCustomers = 0, newCustomers = 0, averageOrdersPerCustomer = 0, topCustomers = [] } = {}) {
  return { uniqueCustomers, repeatCustomers, newCustomers, averageOrdersPerCustomer, topCustomers }
}

const WHEN = '2026-08-11T09:00:00.000Z'
const controlsPageSource = readFileSync('showroom/src/core/WorkspaceControlsPage.tsx', 'utf8')
const evidenceViewsSource = readFileSync('showroom/src/core/WorkspaceEvidenceViews.tsx', 'utf8')
const ceoViewSource = evidenceViewsSource.slice(evidenceViewsSource.indexOf('export function CeoOperatingBriefView('))

function makeRecordingStorage(entries = {}) {
  const records = new Map(Object.entries(entries))
  const writes = []
  return {
    records,
    writes,
    storage: {
      getItem(key) { return records.get(key) ?? null },
      setItem(key, value) { writes.push(['set', key, value]); records.set(key, value) },
      removeItem(key) { writes.push(['remove', key]); records.delete(key) },
    },
  }
}

// 1. Empty state → no alerts, all zeros
{
  const commerceStorage = makeRecordingStorage()
  const productionStorage = makeRecordingStorage()
  const commerce = readCommerceWorkspace(commerceStorage.storage)
  const production = readProductionWorkspace(productionStorage.storage)
  const r = projectCeoOperatingBrief(
    makeShop({ orderCount: commerce.state.orders.length }),
    makePlant({ totalJobs: production.state.jobs.length }),
    makeWebsite(),
    makeEcommerce(),
    makeCrm(),
    WHEN,
  )
  check(commerce.source === 'absent', 'empty Commerce read reports absent instead of seeding')
  check(production.source === 'absent', 'empty Production read reports absent instead of seeding')
  check(commerceStorage.writes.length === 0 && productionStorage.writes.length === 0, 'empty CEO workspace reads perform no writes')
  check(!commerceStorage.records.has(COMMERCE_KEY) && !productionStorage.records.has(PRODUCTION_KEY), 'opening the CEO brief leaves empty storage empty')
  check(r.asOf === WHEN, 'asOf is passed through')
  check(r.alerts.length === 0, 'no alerts for empty state')
  check(r.shopRevenue.totalRevenue === 0, 'shopRevenue.totalRevenue = 0')
  check(r.plantOee.totalJobs === 0, 'plantOee.totalJobs = 0')
  check(r.websiteLeads.totalLeads === 0, 'websiteLeads.totalLeads = 0')
  check(r.ecommercePipeline.totalRequests === 0, 'ecommercePipeline.totalRequests = 0')
  check(r.crmJourney.uniqueCustomers === 0, 'crmJourney.uniqueCustomers = 0')
  check(r.evidenceBoundary.scope === 'browser_local_unverified', 'empty brief stays browser-local and unverified')
  check(r.evidenceBoundary.source === 'this_device_saved_workspace', 'evidence source is this device workspace')
  check(r.evidenceBoundary.localRecordProductCount === 0, 'empty brief has zero products with local records')
  check(Object.values(r.evidenceBoundary.products).every(state => state === 'no_local_records'), 'empty brief distinguishes absent local records from measured zero')
  check(r.evidenceBoundary.pilotEvidenceProven === false, 'empty brief does not prove pilot evidence')
  check(r.evidenceBoundary.customerEvidenceProven === false, 'empty brief does not prove customer evidence')
  check(r.evidenceBoundary.commercialPerformanceProven === false, 'empty brief does not prove commercial performance')
  check(r.evidenceBoundary.productionTelemetryObserved === false, 'empty brief does not claim production telemetry')
}

// 2. Shop passthrough fields
{
  const r = projectCeoOperatingBrief(makeShop({ totalRevenue: 50000, orderCount: 10, completedCount: 8, cancelledCount: 2, averageOrderValue: 5000 }), makePlant(), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  check(r.shopRevenue.totalRevenue === 50000, 'shopRevenue.totalRevenue passed through')
  check(r.shopRevenue.orderCount === 10, 'shopRevenue.orderCount passed through')
  check(r.shopRevenue.completedCount === 8, 'shopRevenue.completedCount passed through')
  check(r.shopRevenue.cancelledCount === 2, 'shopRevenue.cancelledCount passed through')
  check(r.shopRevenue.averageOrderValue === 5000, 'shopRevenue.averageOrderValue passed through')
}

// 3. Shop cancellation rate < 10% → no alert
{
  const r = projectCeoOperatingBrief(makeShop({ orderCount: 10, cancelledCount: 0 }), makePlant(), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  check(r.alerts.filter(a => a.product === 'shop').length === 0, 'no shop alert for 0% cancellations')
}

// 4. Shop cancellation rate 10-24% → warn alert
{
  const r = projectCeoOperatingBrief(makeShop({ orderCount: 9, cancelledCount: 1 }), makePlant(), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const shopAlerts = r.alerts.filter(a => a.product === 'shop')
  check(shopAlerts.length === 1, 'one shop alert at 10% cancellation rate')
  check(shopAlerts[0]?.level === 'warn', 'shop alert is warn level at 10%')
  check(shopAlerts[0]?.message.includes('10%'), 'shop warn message includes rate')
}

// 5. Shop cancellation rate ≥ 25% → critical alert
{
  const r = projectCeoOperatingBrief(makeShop({ orderCount: 3, cancelledCount: 1 }), makePlant(), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const shopAlerts = r.alerts.filter(a => a.product === 'shop')
  check(shopAlerts.length === 1, 'one shop alert at 25% cancellation rate')
  check(shopAlerts[0]?.level === 'critical', 'shop alert is critical at 25%')
}

// 6. Plant 1 overdue job → warn alert
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant({ overdueJobs: 1 }), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const overdueAlerts = r.alerts.filter(a => a.product === 'plant' && a.message.includes('overdue'))
  check(overdueAlerts.length === 1, 'one plant overdue alert for 1 overdue job')
  check(overdueAlerts[0]?.level === 'warn', 'plant overdue alert is warn for 1 job')
  check(overdueAlerts[0]?.message.includes('1 overdue job'), 'singular "job" in message')
}

// 7. Plant ≥3 overdue jobs → critical alert
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant({ overdueJobs: 3 }), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const overdueAlerts = r.alerts.filter(a => a.product === 'plant' && a.message.includes('overdue'))
  check(overdueAlerts[0]?.level === 'critical', 'plant overdue alert is critical for ≥3 jobs')
  check(overdueAlerts[0]?.message.includes('jobs'), 'plural "jobs" for 3 overdue')
}

// 8. Plant jobs on hold → warn alert
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant({ onHoldJobs: 2 }), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const holdAlerts = r.alerts.filter(a => a.product === 'plant' && a.message.includes('hold'))
  check(holdAlerts.length === 1, 'one plant hold alert for 2 on-hold jobs')
  check(holdAlerts[0]?.level === 'warn', 'plant hold alert is warn level')
}

// 9. Plant quality rate < 70% with target → critical alert
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant({ qualityRate: 65, totalTarget: 100 }), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const qualityAlerts = r.alerts.filter(a => a.product === 'plant' && a.message.includes('quality rate'))
  check(qualityAlerts.length === 1, 'one plant quality alert below 70%')
  check(qualityAlerts[0]?.level === 'critical', 'plant quality alert is critical')
  check(qualityAlerts[0]?.message.includes('65%'), 'quality rate in alert message')
}

// 10. Plant quality rate = 70% → no quality alert (boundary: exactly 70 is not < 70)
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant({ qualityRate: 70, totalTarget: 100 }), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const qualityAlerts = r.alerts.filter(a => a.message.includes('quality rate'))
  check(qualityAlerts.length === 0, 'no quality alert at exactly 70%')
}

// 11. Plant no target → no quality alert (qualityRate = 0, totalTarget = 0)
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant({ qualityRate: 0, totalTarget: 0 }), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  const qualityAlerts = r.alerts.filter(a => a.message.includes('quality rate'))
  check(qualityAlerts.length === 0, 'no quality alert when totalTarget = 0')
}

// 12. Ecommerce pending returns → warn alert
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant(), makeWebsite(), makeEcommerce({ pendingReturnIntents: 2 }), makeCrm(), WHEN)
  const returnAlerts = r.alerts.filter(a => a.product === 'ecommerce' && a.message.includes('return'))
  check(returnAlerts.length === 1, 'one ecommerce return alert')
  check(returnAlerts[0]?.level === 'warn', 'ecommerce return alert is warn')
  check(returnAlerts[0]?.message.includes('2 pending return intents'), 'plural in return message')
}

// 13. Ecommerce pending cancellations → warn alert
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant(), makeWebsite(), makeEcommerce({ pendingCancellationIntents: 1 }), makeCrm(), WHEN)
  const cancelAlerts = r.alerts.filter(a => a.product === 'ecommerce' && a.message.includes('cancellation'))
  check(cancelAlerts.length === 1, 'one ecommerce cancellation alert')
  check(cancelAlerts[0]?.level === 'warn', 'ecommerce cancellation alert is warn')
  check(cancelAlerts[0]?.message.includes('1 pending cancellation'), 'singular in cancellation message')
}

// 14. Zero pending intents → no ecommerce alerts
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant(), makeWebsite(), makeEcommerce({ pendingReturnIntents: 0, pendingCancellationIntents: 0 }), makeCrm(), WHEN)
  const ecomAlerts = r.alerts.filter(a => a.product === 'ecommerce')
  check(ecomAlerts.length === 0, 'no ecommerce alerts for zero intents')
}

// 15. Multiple alerts combined
{
  const r = projectCeoOperatingBrief(
    makeShop({ orderCount: 3, cancelledCount: 1 }),
    makePlant({ overdueJobs: 5, onHoldJobs: 1, qualityRate: 55, totalTarget: 200 }),
    makeWebsite(),
    makeEcommerce({ pendingReturnIntents: 1, pendingCancellationIntents: 1 }),
    makeCrm(),
    WHEN,
  )
  check(r.alerts.length === 6, 'six alerts for multi-product alert scenario')
  const critical = r.alerts.filter(a => a.level === 'critical')
  const warn = r.alerts.filter(a => a.level === 'warn')
  check(critical.length === 3, 'three critical alerts (shop cancellation, plant overdue, plant quality)')
  check(warn.length === 3, 'three warn alerts (plant hold, ecommerce return, ecommerce cancel)')
}

// 16. Passthrough: plantOee fields
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant({ totalJobs: 10, closedJobs: 7, openJobs: 3, onHoldJobs: 1, overdueJobs: 0, qualityRate: 90 }), makeWebsite(), makeEcommerce(), makeCrm(), WHEN)
  check(r.plantOee.totalJobs === 10, 'plantOee.totalJobs passed through')
  check(r.plantOee.closedJobs === 7, 'plantOee.closedJobs passed through')
  check(r.plantOee.openJobs === 3, 'plantOee.openJobs passed through')
  check(r.plantOee.onHoldJobs === 1, 'plantOee.onHoldJobs passed through')
  check(r.plantOee.qualityRate === 90, 'plantOee.qualityRate passed through')
}

// 17. Passthrough: websiteLeads fields
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant(), makeWebsite({ totalLeads: 20, newLeads: 10, qualifiedLeads: 8, closedLeads: 4, qualificationRate: 40, closureRate: 20 }), makeEcommerce(), makeCrm(), WHEN)
  check(r.websiteLeads.totalLeads === 20, 'websiteLeads.totalLeads passed through')
  check(r.websiteLeads.qualificationRate === 40, 'websiteLeads.qualificationRate passed through')
  check(r.websiteLeads.closureRate === 20, 'websiteLeads.closureRate passed through')
}

// 18. Passthrough: crmJourney fields
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant(), makeWebsite(), makeEcommerce(), makeCrm({ uniqueCustomers: 15, repeatCustomers: 5, newCustomers: 10, averageOrdersPerCustomer: 1.5 }), WHEN)
  check(r.crmJourney.uniqueCustomers === 15, 'crmJourney.uniqueCustomers passed through')
  check(r.crmJourney.repeatCustomers === 5, 'crmJourney.repeatCustomers passed through')
  check(r.crmJourney.averageOrdersPerCustomer === 1.5, 'crmJourney.averageOrdersPerCustomer passed through')
}

// 19. Passthrough: ecommercePipeline fields
{
  const r = projectCeoOperatingBrief(makeShop(), makePlant(), makeWebsite(), makeEcommerce({ totalRequests: 8, pendingReturnIntents: 0, pendingCancellationIntents: 0 }), makeCrm(), WHEN)
  check(r.ecommercePipeline.totalRequests === 8, 'ecommercePipeline.totalRequests passed through')
  check(r.ecommercePipeline.pendingReturnIntents === 0, 'ecommercePipeline.pendingReturnIntents passed through')
}

// 20. Alert ordering: shop → plant → ecommerce
{
  const r = projectCeoOperatingBrief(
    makeShop({ orderCount: 3, cancelledCount: 1 }),
    makePlant({ overdueJobs: 1 }),
    makeWebsite(),
    makeEcommerce({ pendingReturnIntents: 1 }),
    makeCrm(),
    WHEN,
  )
  check(r.alerts[0]?.product === 'shop', 'first alert is from shop')
  check(r.alerts[1]?.product === 'plant', 'second alert is from plant')
  check(r.alerts[2]?.product === 'ecommerce', 'third alert is from ecommerce')
}

// 21. Local records are detected per product without widening their authority.
{
  const r = projectCeoOperatingBrief(
    makeShop({ orderCount: 1, totalRevenue: 1000 }),
    makePlant({ totalJobs: 1 }),
    makeWebsite({ totalLeads: 1 }),
    makeEcommerce({ pendingReturnIntents: 1 }),
    makeCrm({ uniqueCustomers: 1 }),
    WHEN,
  )
  check(r.evidenceBoundary.localRecordProductCount === 4, 'four products with local records are counted')
  check(Object.values(r.evidenceBoundary.products).every(state => state === 'browser_local_records_present'), 'all four local record states are explicit')
  check(r.evidenceBoundary.commercialPerformanceProven === false, 'local records never become commercial proof')
  check(r.evidenceBoundary.productionTelemetryObserved === false, 'local records never become observed production telemetry')
}

// 22. The owner-facing view names all four products and states the evidence boundary visibly.
{
  for (const text of [
    'Four-product status. Read-only.',
    'Local view — not commercial proof',
    'Local records are not customer, pilot, revenue, commercial, production, or telemetry proof.',
    'Production telemetry',
    'Website',
    'Ecommerce',
  ]) {
    check(ceoViewSource.includes(text), `CEO view includes owner-safe boundary: ${text}`)
  }
  check(ceoViewSource.includes('readCommerceWorkspace()'), 'CEO view uses the non-mutating Commerce reader')
  check(ceoViewSource.includes('readProductionWorkspace()'), 'CEO view uses the non-mutating Production reader')
  check(!ceoViewSource.includes('loadCommerceWorkspace()'), 'CEO view does not call the seeding Commerce loader')
  check(!ceoViewSource.includes('loadProductionWorkspace()'), 'CEO view does not call the seeding Production loader')
}

// 23. The CEO view exposes a safe, ordered operating lifecycle without an execution action.
{
  for (const text of [
    'Go-live controls',
    'Set up, protect, prove, release',
    'Owner-gated',
    'No deployment, publishing, contact, stock, payment, or managed write.',
  ]) check(ceoViewSource.includes(text), `CEO lifecycle includes owner-safe control: ${text}`)
  for (const path of [
    '/settings/?product=shop',
    '/settings/?product=plant',
    '/settings/?product=website',
    '/settings/?product=ecommerce',
    '/settings/#controls',
    '/settings/?view=local-metrics#controls',
  ]) check(evidenceViewsSource.includes(path), `CEO lifecycle links to ${path}`)
  check(ceoViewSource.includes("backupReady ? 'Ready' : 'Needs attention'"), 'CEO lifecycle reports whether a recovery file can be produced')
  check(ceoViewSource.includes("runtime.writesReady ? 'Ready' : 'Locked'"), 'CEO lifecycle reports hosted runtime readiness without widening it')
  check(controlsPageSource.includes("lazy(() => import('./WorkspaceEvidenceViews')"), 'optional evidence views stay outside the Workspace Controls route chunk')
  check(controlsPageSource.includes('<CeoOperatingBriefView backupReady={Boolean(currentBackup)} runtime={runtime} />'), 'CEO lifecycle receives the current read-only backup and runtime state')
}

console.log(`CEO operating brief: ${checks} checks passed`)
