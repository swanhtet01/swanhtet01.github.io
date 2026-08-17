// Working capital summary: synthesizes AR aging + AP aging into a net position.
// Tests passthrough fields, net calculations, all alert rules, and empty/mixed states.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectWorkingCapitalSummary } from './shop-working-capital-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/wc-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectWorkingCapitalSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ASOF = '2026-08-11T12:00:00.000Z'
const EMPTY_BUCKET = { orders: 0, totalMmk: 0, invoices: 0 }

function makeAr({ totalOutstandingMmk = 0, overdueOrders = 0, overdueMmk = 0 } = {}) {
  return {
    asOf: ASOF,
    outstandingOrders: 0,
    totalOutstandingMmk,
    overdueOrders,
    overdueMmk,
    byBucket: { current: EMPTY_BUCKET, '1_7': EMPTY_BUCKET, '8_30': EMPTY_BUCKET, '31_60': EMPTY_BUCKET, over_60: EMPTY_BUCKET },
    mostOverdueCustomer: undefined,
  }
}

function makeAp({ totalPayableMmk = 0, overdueInvoices = 0, overduePayableMmk = 0, pendingReviewInvoices = 0, totalInvoices = 0 } = {}) {
  return {
    asOf: ASOF,
    totalInvoices,
    pendingReviewInvoices,
    readyInvoices: totalInvoices - pendingReviewInvoices,
    overdueInvoices,
    dueWithin7DaysInvoices: 0,
    totalPayableMmk,
    overduePayableMmk,
    byBucket: { overdue: { invoices: overdueInvoices, totalMmk: overduePayableMmk }, due_7_days: { invoices: 0, totalMmk: 0 }, scheduled: { invoices: 0, totalMmk: 0 } },
    mostOverdueSupplier: undefined,
  }
}

// 1. Empty state — all zeros, no alerts
{
  const r = projectWorkingCapitalSummary(makeAr(), makeAp(), ASOF)
  check(r.asOf === ASOF, 'asOf passed through')
  check(r.totalArMmk === 0, 'empty: totalArMmk = 0')
  check(r.totalApMmk === 0, 'empty: totalApMmk = 0')
  check(r.netWorkingCapitalMmk === 0, 'empty: netWorkingCapitalMmk = 0')
  check(r.overdueArMmk === 0, 'empty: overdueArMmk = 0')
  check(r.overdueApMmk === 0, 'empty: overdueApMmk = 0')
  check(r.netOverdueMmk === 0, 'empty: netOverdueMmk = 0')
  check(r.pendingApReviewInvoices === 0, 'empty: pendingApReviewInvoices = 0')
  check(r.alerts.length === 0, 'empty: no alerts')
}

// 2. Passthrough: net positive working capital (AR > AP)
{
  const r = projectWorkingCapitalSummary(makeAr({ totalOutstandingMmk: 100000 }), makeAp({ totalPayableMmk: 60000 }), ASOF)
  check(r.totalArMmk === 100000, 'totalArMmk from AR aging')
  check(r.totalApMmk === 60000, 'totalApMmk from AP aging')
  check(r.netWorkingCapitalMmk === 40000, 'net positive: 100000 - 60000 = 40000')
  check(r.alerts.length === 0, 'no alerts when AR > AP and nothing overdue')
}

// 3. Negative working capital → critical alert
{
  const r = projectWorkingCapitalSummary(makeAr({ totalOutstandingMmk: 40000 }), makeAp({ totalPayableMmk: 90000 }), ASOF)
  check(r.netWorkingCapitalMmk === -50000, 'negative working capital = 40000 - 90000')
  const critical = r.alerts.filter((a) => a.level === 'critical')
  check(critical.length >= 1, 'negative working capital → critical alert')
  check(critical[0]?.message.includes('Negative working capital'), 'critical alert mentions negative working capital')
}

// 4. Overdue AP exists but less than overdue AR → warn alert
{
  const r = projectWorkingCapitalSummary(
    makeAr({ totalOutstandingMmk: 100000, overdueMmk: 50000, overdueOrders: 2 }),
    makeAp({ totalPayableMmk: 60000, overduePayableMmk: 20000, overdueInvoices: 1, totalInvoices: 1 }),
    ASOF,
  )
  const warnAlerts = r.alerts.filter((a) => a.level === 'warn' && a.message.includes('overdue supplier'))
  check(warnAlerts.length === 1, 'overdue AP < overdue AR → warn alert (not critical)')
  check(warnAlerts[0]?.message.includes('1 overdue supplier invoice'), 'warn message uses singular for 1 invoice')
  check(r.overdueArMmk === 50000, 'overdueArMmk from AR aging')
  check(r.overdueApMmk === 20000, 'overdueApMmk from AP aging')
  check(r.netOverdueMmk === 30000, 'netOverdueMmk = 50000 - 20000')
}

// 5. Overdue AP exceeds overdue AR → critical alert
{
  const r = projectWorkingCapitalSummary(
    makeAr({ totalOutstandingMmk: 100000, overdueMmk: 10000 }),
    makeAp({ totalPayableMmk: 60000, overduePayableMmk: 40000, overdueInvoices: 2, totalInvoices: 2 }),
    ASOF,
  )
  const critical = r.alerts.filter((a) => a.level === 'critical' && a.message.includes('Overdue AP'))
  check(critical.length === 1, 'overdue AP > overdue AR → critical alert')
  check(critical[0]?.message.includes('40,000'), 'critical message includes overdue AP amount')
  check(r.netOverdueMmk === -30000, 'netOverdueMmk = 10000 - 40000 = -30000')
}

// 6. Plural in warn message for multiple overdue invoices
{
  const r = projectWorkingCapitalSummary(
    makeAr({ totalOutstandingMmk: 100000, overdueMmk: 50000 }),
    makeAp({ totalPayableMmk: 60000, overduePayableMmk: 20000, overdueInvoices: 3, totalInvoices: 3 }),
    ASOF,
  )
  const warnAlerts = r.alerts.filter((a) => a.level === 'warn' && a.message.includes('overdue supplier'))
  check(warnAlerts[0]?.message.includes('3 overdue supplier invoices'), 'warn message uses plural for 3 invoices')
}

// 7. Pending review invoices → warn alert
{
  const r = projectWorkingCapitalSummary(makeAr(), makeAp({ pendingReviewInvoices: 2, totalInvoices: 2 }), ASOF)
  const pendingWarn = r.alerts.filter((a) => a.level === 'warn' && a.message.includes('pending AP review'))
  check(pendingWarn.length === 1, 'pending review invoices → warn alert')
  check(pendingWarn[0]?.message.includes('2 supplier invoices'), 'pending warn uses plural')
  check(r.pendingApReviewInvoices === 2, 'pendingApReviewInvoices passed through')
}

// 8. Singular pending review invoice
{
  const r = projectWorkingCapitalSummary(makeAr(), makeAp({ pendingReviewInvoices: 1, totalInvoices: 1 }), ASOF)
  const pendingWarn = r.alerts.filter((a) => a.message.includes('pending AP review'))
  check(pendingWarn[0]?.message.includes('1 supplier invoice pending'), 'singular for 1 pending invoice')
}

// 9. No overdue AP → no AP overdue alert
{
  const r = projectWorkingCapitalSummary(makeAr(), makeAp({ overduePayableMmk: 0, overdueInvoices: 0 }), ASOF)
  const apAlerts = r.alerts.filter((a) => a.message.includes('overdue supplier'))
  check(apAlerts.length === 0, 'no overdue AP → no AP overdue alert')
}

// 10. Multiple alerts simultaneously: negative working capital + overdue AP + pending review
{
  const r = projectWorkingCapitalSummary(
    makeAr({ totalOutstandingMmk: 20000, overdueMmk: 5000 }),
    makeAp({ totalPayableMmk: 50000, overduePayableMmk: 30000, overdueInvoices: 2, pendingReviewInvoices: 1, totalInvoices: 3 }),
    ASOF,
  )
  check(r.alerts.length === 3, 'three simultaneous alerts: negative WC, overdue AP > overdue AR, pending review')
  check(r.alerts.filter((a) => a.level === 'critical').length === 2, 'two critical alerts')
  check(r.alerts.filter((a) => a.level === 'warn').length === 1, 'one warn alert (pending review)')
}

console.log(`Working capital summary: ${checks} checks passed`)
