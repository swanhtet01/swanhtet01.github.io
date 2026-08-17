// Shop order line name/variant brief: CommerceOrderLine.name and variant? on order lines.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderLineNameVariantBrief } from './shop-order-line-name-variant-brief.ts'`,
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

const { projectShopOrderLineNameVariantBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let skuSeq = 0
function line({ name = 'Widget', variant, quantity = 1, unitPriceMmk = 1000 } = {}) {
  skuSeq++
  const base = { sku: `SKU-${skuSeq}`, name, quantity, unitPriceMmk }
  if (variant !== undefined) base.variant = variant
  return base
}

let orderId = 0
function order(lines) {
  orderId++
  return {
    id: `ORD-${orderId}`,
    createdAt: '2026-08-12T08:00:00Z',
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
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders, movements: [], closes: [] }
}

// 1. Empty orders → all zeros
{
  const r = projectShopOrderLineNameVariantBrief(state([]))
  check(r.totalLines === 0, 'empty: totalLines 0')
  check(r.uniqueLineNames === 0, 'empty: uniqueLineNames 0')
  check(r.topLineNamesByCount.length === 0, 'empty: topNames empty')
  check(r.linesWithVariant === 0, 'empty: withVariant 0')
  check(r.linesWithoutVariant === 0, 'empty: withoutVariant 0')
  check(r.variantRate === 0, 'empty: variantRate 0')
  check(r.uniqueVariants === 0, 'empty: uniqueVariants 0')
  check(r.topVariantsByCount.length === 0, 'empty: topVariants empty')
}

// 2. Order with no lines field → zero
{
  const r = projectShopOrderLineNameVariantBrief(state([order(undefined)]))
  check(r.totalLines === 0, 'no-lines: totalLines 0')
}

// 3. Single line without variant
{
  const r = projectShopOrderLineNameVariantBrief(state([order([line({ name: 'Cooking Oil' })])]))
  check(r.totalLines === 1, 'no-variant: totalLines 1')
  check(r.uniqueLineNames === 1, 'no-variant: uniqueLineNames 1')
  check(r.topLineNamesByCount[0].name === 'Cooking Oil', 'no-variant: top name')
  check(r.topLineNamesByCount[0].count === 1, 'no-variant: count 1')
  check(r.linesWithVariant === 0, 'no-variant: withVariant 0')
  check(r.linesWithoutVariant === 1, 'no-variant: withoutVariant 1')
  check(r.variantRate === 0, 'no-variant: variantRate 0')
}

// 4. Single line with variant
{
  const r = projectShopOrderLineNameVariantBrief(state([order([line({ name: 'Rice', variant: '5kg' })])]))
  check(r.totalLines === 1, 'with-variant: totalLines 1')
  check(r.linesWithVariant === 1, 'with-variant: withVariant 1')
  check(r.linesWithoutVariant === 0, 'with-variant: withoutVariant 0')
  check(r.variantRate === 100, 'with-variant: variantRate 100')
  check(r.uniqueVariants === 1, 'with-variant: uniqueVariants 1')
  check(r.topVariantsByCount[0].variant === '5kg', 'with-variant: top variant 5kg')
}

// 5. Mixed lines across multiple orders: rate and name uniqueness
{
  const r = projectShopOrderLineNameVariantBrief(state([
    order([line({ name: 'Rice', variant: '5kg' }), line({ name: 'Oil' })]),
    order([line({ name: 'Rice', variant: '1kg' }), line({ name: 'Sugar' })]),
  ]))
  check(r.totalLines === 4, 'mixed: totalLines 4')
  check(r.uniqueLineNames === 3, 'mixed: uniqueLineNames 3 (Rice×2, Oil×1, Sugar×1)')
  check(r.linesWithVariant === 2, 'mixed: withVariant 2')
  check(r.linesWithoutVariant === 2, 'mixed: withoutVariant 2')
  check(r.variantRate === 50, 'mixed: variantRate 50')
  check(r.uniqueVariants === 2, 'mixed: uniqueVariants 2')
}

// 6. Top name ordering: Rice×3 beats Oil×2
{
  const r = projectShopOrderLineNameVariantBrief(state([
    order([line({ name: 'Rice' }), line({ name: 'Oil' }), line({ name: 'Rice' })]),
    order([line({ name: 'Oil' }), line({ name: 'Rice' })]),
  ]))
  check(r.topLineNamesByCount[0].name === 'Rice', 'top-name: Rice first')
  check(r.topLineNamesByCount[0].count === 3, 'top-name: Rice count 3')
  check(r.topLineNamesByCount[1].name === 'Oil', 'top-name: Oil second')
}

// 7. Rounding: 1/3 lines have variant → 33%
{
  const r = projectShopOrderLineNameVariantBrief(state([order([
    line({ variant: 'A' }),
    line(),
    line(),
  ])]))
  check(r.variantRate === 33, 'rounding: variantRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
