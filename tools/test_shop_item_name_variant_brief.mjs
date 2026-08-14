// Shop item name/variant brief: name uniqueness and variant distribution across the item catalog.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopItemNameVariantBrief } from './shop-item-name-variant-brief.ts'`,
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

const { projectShopItemNameVariantBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let skuId = 0
function item({ name = 'Widget', variant, price = 1000, onHand = 10, reorderAt = 5 } = {}) {
  skuId++
  const base = { sku: `SKU-${skuId}`, name, onHand, reorderAt, price }
  if (variant !== undefined) base.variant = variant
  return base
}

function state(items = []) {
  return { schema: SCHEMA, items, orders: [], movements: [], closes: [] }
}

// 1. Empty catalog → all zeros
{
  const r = projectShopItemNameVariantBrief(state([]))
  check(r.totalItems === 0, 'empty: totalItems 0')
  check(r.uniqueNames === 0, 'empty: uniqueNames 0')
  check(r.itemsWithVariant === 0, 'empty: withVariant 0')
  check(r.itemsWithoutVariant === 0, 'empty: withoutVariant 0')
  check(r.variantRate === 0, 'empty: variantRate 0')
  check(r.uniqueVariants === 0, 'empty: uniqueVariants 0')
  check(r.topVariantsByCount.length === 0, 'empty: topVariants empty')
}

// 2. Single item without variant
{
  const r = projectShopItemNameVariantBrief(state([item({ name: 'Cooking Oil' })]))
  check(r.totalItems === 1, 'no-variant: totalItems 1')
  check(r.uniqueNames === 1, 'no-variant: uniqueNames 1')
  check(r.itemsWithVariant === 0, 'no-variant: withVariant 0')
  check(r.itemsWithoutVariant === 1, 'no-variant: withoutVariant 1')
  check(r.variantRate === 0, 'no-variant: variantRate 0')
}

// 3. Single item with variant
{
  const r = projectShopItemNameVariantBrief(state([item({ name: 'Rice', variant: '5kg' })]))
  check(r.totalItems === 1, 'with-variant: totalItems 1')
  check(r.itemsWithVariant === 1, 'with-variant: withVariant 1')
  check(r.itemsWithoutVariant === 0, 'with-variant: withoutVariant 0')
  check(r.variantRate === 100, 'with-variant: variantRate 100')
  check(r.uniqueVariants === 1, 'with-variant: uniqueVariants 1')
  check(r.topVariantsByCount[0].variant === '5kg', 'with-variant: top variant name')
  check(r.topVariantsByCount[0].count === 1, 'with-variant: top variant count 1')
}

// 4. Mixed: some with variant, some without — rate calculation
{
  const r = projectShopItemNameVariantBrief(state([
    item({ name: 'Rice', variant: '1kg' }),
    item({ name: 'Rice', variant: '5kg' }),
    item({ name: 'Oil' }),
    item({ name: 'Sugar' }),
  ]))
  check(r.totalItems === 4, 'mixed: totalItems 4')
  check(r.uniqueNames === 3, 'mixed: uniqueNames 3 (Rice shared)')
  check(r.itemsWithVariant === 2, 'mixed: withVariant 2')
  check(r.itemsWithoutVariant === 2, 'mixed: withoutVariant 2')
  check(r.variantRate === 50, 'mixed: variantRate 50')
  check(r.uniqueVariants === 2, 'mixed: uniqueVariants 2')
}

// 5. Repeated variant → count accumulates
{
  const r = projectShopItemNameVariantBrief(state([
    item({ name: 'Rice', variant: '5kg' }),
    item({ name: 'Flour', variant: '5kg' }),
    item({ name: 'Sugar', variant: '1kg' }),
  ]))
  check(r.totalItems === 3, 'repeat-variant: totalItems 3')
  check(r.uniqueVariants === 2, 'repeat-variant: uniqueVariants 2')
  const top = r.topVariantsByCount[0]
  check(top.variant === '5kg', 'repeat-variant: top is 5kg')
  check(top.count === 2, 'repeat-variant: 5kg count 2')
}

// 6. Rounding: 1/3 items have variant → 33%
{
  const r = projectShopItemNameVariantBrief(state([
    item({ variant: 'A' }),
    item(),
    item(),
  ]))
  check(r.variantRate === 33, 'rounding: variantRate 33 (Math.round(1/3*100))')
}

// 7. Tie-break: same count → lexicographic on variant name
{
  const r = projectShopItemNameVariantBrief(state([
    item({ variant: 'XL' }),
    item({ variant: 'SM' }),
  ]))
  check(r.topVariantsByCount[0].variant === 'SM', 'tiebreak: SM before XL')
}

console.log(JSON.stringify({ ok: true, checks }))
