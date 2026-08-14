// Shop daily close exception brief: payment + stock exception analytics from CommerceClose.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopDailyCloseExceptionBrief } from './shop-daily-close-exception-brief.ts'`,
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

const { projectShopDailyCloseExceptionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let closeId = 0
function close({ operator, paymentExceptions, stockExceptions } = {}) {
  closeId++
  const c = { id: `close-${closeId}`, createdAt: '2026-08-11T22:00:00Z', total: 10000, orders: 5 }
  if (operator !== undefined) c.operator = operator
  if (paymentExceptions) c.paymentExceptionOrderIds = paymentExceptions
  if (stockExceptions) c.stockExceptionSkus = stockExceptions
  return c
}

function state(...closes) {
  return { schema: 'supermega.commerce.workspace.v1', revision: 1, orders: [], closes, purchaseOrders: [] }
}

// 1. Empty → all zeros
{
  const r = projectShopDailyCloseExceptionBrief(state())
  check(r.totalCloses === 0, 'empty: totalCloses 0')
  check(r.closesWithOperator === 0, 'empty: closesWithOperator 0')
  check(r.closesWithPaymentExceptions === 0, 'empty: closesWithPaymentExceptions 0')
  check(r.closesWithStockExceptions === 0, 'empty: closesWithStockExceptions 0')
  check(r.totalPaymentExceptionOrders === 0, 'empty: totalPaymentExceptionOrders 0')
  check(r.totalStockExceptionSkus === 0, 'empty: totalStockExceptionSkus 0')
  check(r.paymentExceptionRate === 0, 'empty: paymentExceptionRate 0')
  check(r.stockExceptionRate === 0, 'empty: stockExceptionRate 0')
}

// 2. Clean close — no exceptions, no operator
{
  const r = projectShopDailyCloseExceptionBrief(state(close()))
  check(r.totalCloses === 1, 'clean: totalCloses 1')
  check(r.closesWithOperator === 0, 'clean: closesWithOperator 0')
  check(r.closesWithPaymentExceptions === 0, 'clean: closesWithPaymentExceptions 0')
  check(r.closesWithStockExceptions === 0, 'clean: closesWithStockExceptions 0')
  check(r.paymentExceptionRate === 0, 'clean: paymentExceptionRate 0')
  check(r.stockExceptionRate === 0, 'clean: stockExceptionRate 0')
}

// 3. Operator tracked
{
  const r = projectShopDailyCloseExceptionBrief(state(close({ operator: 'alice' })))
  check(r.closesWithOperator === 1, 'operator: closesWithOperator 1')
}

// 4. Payment exceptions
{
  const r = projectShopDailyCloseExceptionBrief(state(
    close({ paymentExceptions: ['ord-1', 'ord-2'] }),
  ))
  check(r.closesWithPaymentExceptions === 1, 'payment-exc: closesWithPaymentExceptions 1')
  check(r.totalPaymentExceptionOrders === 2, 'payment-exc: totalPaymentExceptionOrders 2')
  check(r.paymentExceptionRate === 100, 'payment-exc: paymentExceptionRate 100')
}

// 5. Stock exceptions
{
  const r = projectShopDailyCloseExceptionBrief(state(
    close({ stockExceptions: ['SKU-A', 'SKU-B', 'SKU-C'] }),
  ))
  check(r.closesWithStockExceptions === 1, 'stock-exc: closesWithStockExceptions 1')
  check(r.totalStockExceptionSkus === 3, 'stock-exc: totalStockExceptionSkus 3')
  check(r.stockExceptionRate === 100, 'stock-exc: stockExceptionRate 100')
}

// 6. Empty exception arrays treated as no exception
{
  const r = projectShopDailyCloseExceptionBrief(state(
    close({ paymentExceptions: [], stockExceptions: [] }),
  ))
  check(r.closesWithPaymentExceptions === 0, 'empty-arrays: paymentExceptions not counted')
  check(r.closesWithStockExceptions === 0, 'empty-arrays: stockExceptions not counted')
}

// 7. Rate calculation — 1 of 2 closes = 50%
{
  const r = projectShopDailyCloseExceptionBrief(state(
    close({ paymentExceptions: ['ord-1'] }),
    close(),
  ))
  check(r.paymentExceptionRate === 50, 'rate-50pct: paymentExceptionRate 50')
  check(r.totalCloses === 2, 'rate-50pct: totalCloses 2')
}

// 8. Accumulation across multiple closes
{
  const r = projectShopDailyCloseExceptionBrief(state(
    close({ paymentExceptions: ['ord-1'], stockExceptions: ['SKU-A'] }),
    close({ paymentExceptions: ['ord-2', 'ord-3'] }),
    close({ stockExceptions: ['SKU-B'] }),
  ))
  check(r.closesWithPaymentExceptions === 2, 'accum: closesWithPaymentExceptions 2')
  check(r.totalPaymentExceptionOrders === 3, 'accum: totalPaymentExceptionOrders 3')
  check(r.closesWithStockExceptions === 2, 'accum: closesWithStockExceptions 2')
  check(r.totalStockExceptionSkus === 2, 'accum: totalStockExceptionSkus 2')
}

console.log(JSON.stringify({ ok: true, checks }))
