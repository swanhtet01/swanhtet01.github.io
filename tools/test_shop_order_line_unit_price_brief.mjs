// Shop order line unit price brief: unitPriceMmk stats across order lines.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderLineUnitPriceBrief } from './shop-order-line-unit-price-brief.ts'`,
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

const { projectShopOrderLineUnitPriceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let orderId = 0

function line(unitPriceMmk) {
  return { sku: 'SKU-1', name: 'Item', quantity: 1, unitPriceMmk }
}

function order(lines) {
  orderId++
  return {
    id: `ORD-${orderId}`,
    createdAt: '2026-08-01T00:00:00Z',
    customer: 'cust-1',
    channel: 'counter',
    item: 'item-1',
    quantity: 1,
    payment: 'cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    total: 1000,
    status: 'confirmed',
    ...(lines !== undefined ? { lines } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty orders → null min/max, zero averages
{
  const r = projectShopOrderLineUnitPriceBrief(state([]))
  check(r.totalLines === 0, 'empty: totalLines 0')
  check(r.totalUnitPriceMmk === 0, 'empty: totalUnitPriceMmk 0')
  check(r.averageUnitPriceMmk === 0, 'empty: averageUnitPriceMmk 0')
  check(r.minUnitPriceMmk === null, 'empty: minUnitPriceMmk null')
  check(r.maxUnitPriceMmk === null, 'empty: maxUnitPriceMmk null')
}

// 2. Order with no lines field (optional)
{
  const r = projectShopOrderLineUnitPriceBrief(state([order(undefined)]))
  check(r.totalLines === 0, 'no-lines: totalLines 0')
  check(r.minUnitPriceMmk === null, 'no-lines: minUnitPriceMmk null')
}

// 3. Single line
{
  const r = projectShopOrderLineUnitPriceBrief(state([order([line(5000)])]))
  check(r.totalLines === 1, 'single: totalLines 1')
  check(r.totalUnitPriceMmk === 5000, 'single: totalUnitPriceMmk 5000')
  check(r.averageUnitPriceMmk === 5000, 'single: averageUnitPriceMmk 5000')
  check(r.minUnitPriceMmk === 5000, 'single: minUnitPriceMmk 5000')
  check(r.maxUnitPriceMmk === 5000, 'single: maxUnitPriceMmk 5000')
}

// 4. Two lines same price
{
  const r = projectShopOrderLineUnitPriceBrief(state([order([line(2000), line(2000)])]))
  check(r.totalLines === 2, 'same-price: totalLines 2')
  check(r.totalUnitPriceMmk === 4000, 'same-price: totalUnitPriceMmk 4000')
  check(r.averageUnitPriceMmk === 2000, 'same-price: averageUnitPriceMmk 2000')
  check(r.minUnitPriceMmk === 2000, 'same-price: minUnitPriceMmk 2000')
  check(r.maxUnitPriceMmk === 2000, 'same-price: maxUnitPriceMmk 2000')
}

// 5. Lines with different prices — min/max selection
{
  const r = projectShopOrderLineUnitPriceBrief(state([
    order([line(1000), line(3000), line(500)]),
  ]))
  check(r.totalLines === 3, 'diff-price: totalLines 3')
  check(r.minUnitPriceMmk === 500, 'diff-price: minUnitPriceMmk 500')
  check(r.maxUnitPriceMmk === 3000, 'diff-price: maxUnitPriceMmk 3000')
  check(r.totalUnitPriceMmk === 4500, 'diff-price: totalUnitPriceMmk 4500')
  check(r.averageUnitPriceMmk === 1500, 'diff-price: averageUnitPriceMmk 1500')
}

// 6. Lines across multiple orders
{
  const r = projectShopOrderLineUnitPriceBrief(state([
    order([line(4000)]),
    order([line(6000), line(2000)]),
  ]))
  check(r.totalLines === 3, 'multi-order: totalLines 3')
  check(r.totalUnitPriceMmk === 12000, 'multi-order: totalUnitPriceMmk 12000')
  check(r.minUnitPriceMmk === 2000, 'multi-order: minUnitPriceMmk 2000')
  check(r.maxUnitPriceMmk === 6000, 'multi-order: maxUnitPriceMmk 6000')
}

// 7. Rounding: 7000 / 3 = 2333.33 → 2333
{
  const r = projectShopOrderLineUnitPriceBrief(state([order([line(1000), line(2000), line(4000)])]))
  check(r.totalUnitPriceMmk === 7000, 'rounding: total 7000')
  check(r.averageUnitPriceMmk === 2333, 'rounding: averageUnitPriceMmk 2333')
}

console.log(JSON.stringify({ ok: true, checks }))
