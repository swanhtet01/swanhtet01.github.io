// Shop close business date brief: businessDate coverage on CommerceClose.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCloseBusinessDateBrief } from './shop-close-business-date-brief.ts'`,
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

const { projectShopCloseBusinessDateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let closeId = 0
function close({ businessDate } = {}) {
  closeId++
  return {
    id: `close-${closeId}`,
    createdAt: '2026-08-11T18:00:00Z',
    total: 10000,
    orders: 2,
    ...(businessDate !== undefined && { businessDate }),
  }
}

function state(closes) {
  return {
    schema: 'supermega.shop.commerce.v1',
    items: [],
    orders: [],
    movements: [],
    closes: closes ?? [],
    catalogBaselines: [],
    catalogChanges: [],
    promotionPolicies: [],
    shippingPolicies: [],
    paymentPolicies: [],
    websiteIntakes: [],
    storefrontRequests: [],
    purchaseBudgetEnvelopes: [],
    supplierSourcingDecisions: [],
    purchaseOrders: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectShopCloseBusinessDateBrief(state([]))
  check(r.totalCloses === 0, 'empty: totalCloses 0')
  check(r.closesWithBusinessDate === 0, 'empty: closesWithBusinessDate 0')
  check(r.closesWithoutBusinessDate === 0, 'empty: closesWithoutBusinessDate 0')
  check(r.businessDateCoverage === 0, 'empty: businessDateCoverage 0')
  check(r.uniqueBusinessDates === 0, 'empty: uniqueBusinessDates 0')
}

// 2. Close without businessDate (legacy close using createdAt fallback)
{
  const r = projectShopCloseBusinessDateBrief(state([close()]))
  check(r.totalCloses === 1, 'no-date: totalCloses 1')
  check(r.closesWithBusinessDate === 0, 'no-date: closesWithBusinessDate 0')
  check(r.closesWithoutBusinessDate === 1, 'no-date: closesWithoutBusinessDate 1')
  check(r.businessDateCoverage === 0, 'no-date: businessDateCoverage 0')
  check(r.uniqueBusinessDates === 0, 'no-date: uniqueBusinessDates 0')
}

// 3. Close with businessDate
{
  const r = projectShopCloseBusinessDateBrief(state([close({ businessDate: '2026-08-11' })]))
  check(r.closesWithBusinessDate === 1, 'with-date: closesWithBusinessDate 1')
  check(r.closesWithoutBusinessDate === 0, 'with-date: closesWithoutBusinessDate 0')
  check(r.businessDateCoverage === 100, 'with-date: businessDateCoverage 100')
  check(r.uniqueBusinessDates === 1, 'with-date: uniqueBusinessDates 1')
}

// 4. Two closes, same businessDate → uniqueBusinessDates = 1
{
  const r = projectShopCloseBusinessDateBrief(state([
    close({ businessDate: '2026-08-10' }),
    close({ businessDate: '2026-08-10' }),
  ]))
  check(r.closesWithBusinessDate === 2, 'same-date: closesWithBusinessDate 2')
  check(r.uniqueBusinessDates === 1, 'same-date: uniqueBusinessDates 1')
}

// 5. Two closes, different businessDates → uniqueBusinessDates = 2
{
  const r = projectShopCloseBusinessDateBrief(state([
    close({ businessDate: '2026-08-10' }),
    close({ businessDate: '2026-08-11' }),
  ]))
  check(r.uniqueBusinessDates === 2, 'diff-dates: uniqueBusinessDates 2')
  check(r.businessDateCoverage === 100, 'diff-dates: businessDateCoverage 100')
}

// 6. Mixed: 1 with date, 1 without → 50% coverage
{
  const r = projectShopCloseBusinessDateBrief(state([
    close({ businessDate: '2026-08-11' }),
    close(),
  ]))
  check(r.totalCloses === 2, 'mixed: totalCloses 2')
  check(r.closesWithBusinessDate === 1, 'mixed: closesWithBusinessDate 1')
  check(r.closesWithoutBusinessDate === 1, 'mixed: closesWithoutBusinessDate 1')
  check(r.businessDateCoverage === 50, 'mixed: businessDateCoverage 50')
  check(r.uniqueBusinessDates === 1, 'mixed: uniqueBusinessDates 1')
}

// 7. businessDateCoverage rounds — 2 of 3 = 67%
{
  const r = projectShopCloseBusinessDateBrief(state([
    close({ businessDate: '2026-08-09' }),
    close({ businessDate: '2026-08-10' }),
    close(),
  ]))
  check(r.businessDateCoverage === 67, 'round-67pct: businessDateCoverage 67')
  check(r.uniqueBusinessDates === 2, 'round-67pct: uniqueBusinessDates 2')
}

console.log(JSON.stringify({ ok: true, checks }))
