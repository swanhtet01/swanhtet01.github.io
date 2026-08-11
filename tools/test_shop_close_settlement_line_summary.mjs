// Shop close settlement line summary: per-payment-method variance across closes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCloseSettlementLineSummary } from './shop-close-settlement-line-summary.ts'`,
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

const { projectShopCloseSettlementLineSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function settlementLine({ paymentMethod = 'cash', expectedMmk = 10000, countedMmk = 10000, varianceMmk = 0, status = 'matched' } = {}) {
  return { paymentMethod, expectedMmk, countedMmk, varianceMmk, status, varianceOwner: null, varianceReason: null }
}

function settlement(lines, status = 'matched') {
  const totalVarianceMmk = lines.reduce((sum, l) => sum + l.varianceMmk, 0)
  const totalExpectedMmk = lines.reduce((sum, l) => sum + l.expectedMmk, 0)
  const totalCountedMmk = lines.reduce((sum, l) => sum + l.countedMmk, 0)
  return { schema: 'supermega.commerce.close.settlement.v1', status, totalExpectedMmk, totalCountedMmk, totalVarianceMmk, lines }
}

function close({ id = 'CLS-1', total = 50000, orders = 3, s = null } = {}) {
  const base = { id, createdAt: '2026-01-01T00:00:00Z', total, orders }
  return s ? { ...base, settlement: s } : base
}

function state(closes = []) {
  return { schema: SCHEMA, items: [], orders: [], movements: [], closes }
}

// 1. Empty state
{
  const r = projectShopCloseSettlementLineSummary(state([]))
  check(r.closesWithSettlement === 0, 'empty: closesWithSettlement 0')
  check(r.totalSettlementLines === 0, 'empty: totalSettlementLines 0')
  check(r.uniquePaymentMethods === 0, 'empty: uniquePaymentMethods 0')
  check(r.byPaymentMethod.length === 0, 'empty: byPaymentMethod empty')
  check(r.highestVarianceMethod === null, 'empty: highestVarianceMethod null')
}

// 2. Close without settlement
{
  const r = projectShopCloseSettlementLineSummary(state([close({ id: 'CLS-1' })]))
  check(r.closesWithSettlement === 0, 'no-settlement: closesWithSettlement 0')
  check(r.uniquePaymentMethods === 0, 'no-settlement: uniquePaymentMethods 0')
}

// 3. Single close, single line, matched
{
  const lines = [settlementLine({ paymentMethod: 'cash', expectedMmk: 50000, countedMmk: 50000, varianceMmk: 0 })]
  const s = settlement(lines)
  const r = projectShopCloseSettlementLineSummary(state([close({ s })]))
  check(r.closesWithSettlement === 1, 'single-matched: closesWithSettlement 1')
  check(r.totalSettlementLines === 1, 'single-matched: totalSettlementLines 1')
  check(r.uniquePaymentMethods === 1, 'single-matched: uniquePaymentMethods 1')
  check(r.byPaymentMethod[0].paymentMethod === 'cash', 'single-matched: paymentMethod cash')
  check(r.byPaymentMethod[0].totalVarianceMmk === 0, 'single-matched: variance 0')
  check(r.byPaymentMethod[0].closesWithVariance === 0, 'single-matched: closesWithVariance 0')
}

// 4. Single close, two methods, one with variance
{
  const lines = [
    settlementLine({ paymentMethod: 'cash', expectedMmk: 30000, countedMmk: 30000, varianceMmk: 0, status: 'matched' }),
    settlementLine({ paymentMethod: 'kbzpay', expectedMmk: 20000, countedMmk: 19000, varianceMmk: -1000, status: 'variance_review' }),
  ]
  const r = projectShopCloseSettlementLineSummary(state([close({ s: settlement(lines, 'variance_review') })]))
  check(r.uniquePaymentMethods === 2, 'two-methods: uniquePaymentMethods 2')
  check(r.totalSettlementLines === 2, 'two-methods: totalSettlementLines 2')
  const kbz = r.byPaymentMethod.find(e => e.paymentMethod === 'kbzpay')
  check(kbz !== undefined, 'two-methods: kbzpay entry exists')
  check(kbz.closesWithVariance === 1, 'two-methods: kbzpay closesWithVariance 1')
  check(r.highestVarianceMethod === 'kbzpay', 'two-methods: highestVarianceMethod kbzpay (1000 abs variance)')
}

// 5. Two closes, same payment method, variances accumulate
{
  const lines1 = [settlementLine({ paymentMethod: 'cash', expectedMmk: 50000, countedMmk: 48000, varianceMmk: -2000, status: 'variance_review' })]
  const lines2 = [settlementLine({ paymentMethod: 'cash', expectedMmk: 30000, countedMmk: 31000, varianceMmk: 1000, status: 'variance_review' })]
  const r = projectShopCloseSettlementLineSummary(state([
    close({ id: 'CLS-1', s: settlement(lines1, 'variance_review') }),
    close({ id: 'CLS-2', s: settlement(lines2, 'variance_review') }),
  ]))
  check(r.closesWithSettlement === 2, 'accum: closesWithSettlement 2')
  check(r.uniquePaymentMethods === 1, 'accum: uniquePaymentMethods 1 (same method)')
  const cashEntry = r.byPaymentMethod[0]
  check(cashEntry.totalExpectedMmk === 80000, 'accum: totalExpectedMmk 80000')
  check(cashEntry.totalCountedMmk === 79000, 'accum: totalCountedMmk 79000')
  check(cashEntry.totalVarianceMmk === -1000, 'accum: totalVarianceMmk -1000 (sum -2000+1000)')
  check(cashEntry.closesWithVariance === 2, 'accum: closesWithVariance 2')
}

// 6. highestVarianceMethod picks highest absolute variance
{
  const lines = [
    settlementLine({ paymentMethod: 'cash', expectedMmk: 10000, countedMmk: 9000, varianceMmk: -1000, status: 'variance_review' }),
    settlementLine({ paymentMethod: 'transfer', expectedMmk: 5000, countedMmk: 2000, varianceMmk: -3000, status: 'variance_review' }),
  ]
  const r = projectShopCloseSettlementLineSummary(state([close({ s: settlement(lines, 'variance_review') })]))
  check(r.highestVarianceMethod === 'transfer', 'abs-sort: transfer has highest abs variance (3000 vs 1000)')
}

console.log(JSON.stringify({ ok: true, checks }))
