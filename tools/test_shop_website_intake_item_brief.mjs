// Shop website intake item brief: itemName and itemVariant coverage on website intakes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopWebsiteIntakeItemBrief } from './shop-website-intake-item-brief.ts'`,
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

const { projectShopWebsiteIntakeItemBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act-1', capturedAt: '2026-08-11T08:00:00Z', actor: 'system' }
let seq = 0

function intake({ itemName = 'Cooking Oil', itemVariant, sku = 'SKU-A', quantity = 1, unitPrice = 5000 } = {}) {
  seq++
  const base = {
    id: `wi-${seq}`,
    createdAt: '2026-08-11T08:00:00Z',
    status: 'pending_confirmation',
    source: { kind: 'website', url: 'https://example.com' },
    sku,
    quantity,
    itemName,
    unitPrice,
    total: quantity * unitPrice,
    creation: PROOF,
  }
  if (itemVariant !== undefined) base.itemVariant = itemVariant
  return base
}

function state(websiteIntakes) {
  return {
    items: [],
    orders: [],
    movements: [],
    closes: [],
    ...(websiteIntakes !== undefined ? { websiteIntakes } : {}),
  }
}

// 1. No websiteIntakes field → all zeros
{
  const r = projectShopWebsiteIntakeItemBrief(state(undefined))
  check(r.totalIntakes === 0, 'none: totalIntakes 0')
  check(r.uniqueItemNames === 0, 'none: uniqueItemNames 0')
  check(r.topItemNamesByCount.length === 0, 'none: topNames empty')
  check(r.intakesWithVariant === 0, 'none: withVariant 0')
  check(r.intakesWithoutVariant === 0, 'none: withoutVariant 0')
  check(r.variantRate === 0, 'none: variantRate 0')
  check(r.uniqueItemVariants === 0, 'none: uniqueVariants 0')
  check(r.topItemVariantsByCount.length === 0, 'none: topVariants empty')
}

// 2. Empty array → same zeros
{
  const r = projectShopWebsiteIntakeItemBrief(state([]))
  check(r.totalIntakes === 0, 'empty: totalIntakes 0')
}

// 3. Single intake without variant
{
  const r = projectShopWebsiteIntakeItemBrief(state([intake({ itemName: 'Rice Bag' })]))
  check(r.totalIntakes === 1, 'no-variant: totalIntakes 1')
  check(r.uniqueItemNames === 1, 'no-variant: uniqueItemNames 1')
  check(r.topItemNamesByCount[0].itemName === 'Rice Bag', 'no-variant: top name')
  check(r.topItemNamesByCount[0].count === 1, 'no-variant: count 1')
  check(r.intakesWithVariant === 0, 'no-variant: withVariant 0')
  check(r.intakesWithoutVariant === 1, 'no-variant: withoutVariant 1')
  check(r.variantRate === 0, 'no-variant: variantRate 0')
}

// 4. Single intake with variant
{
  const r = projectShopWebsiteIntakeItemBrief(state([intake({ itemName: 'Rice', itemVariant: '5kg' })]))
  check(r.totalIntakes === 1, 'with-variant: totalIntakes 1')
  check(r.intakesWithVariant === 1, 'with-variant: withVariant 1')
  check(r.intakesWithoutVariant === 0, 'with-variant: withoutVariant 0')
  check(r.variantRate === 100, 'with-variant: variantRate 100')
  check(r.uniqueItemVariants === 1, 'with-variant: uniqueVariants 1')
  check(r.topItemVariantsByCount[0].itemVariant === '5kg', 'with-variant: top variant name')
}

// 5. Mixed: variant rate
{
  const r = projectShopWebsiteIntakeItemBrief(state([
    intake({ itemName: 'Rice', itemVariant: '5kg' }),
    intake({ itemName: 'Oil' }),
    intake({ itemName: 'Sugar' }),
    intake({ itemName: 'Rice', itemVariant: '1kg' }),
  ]))
  check(r.totalIntakes === 4, 'mixed: totalIntakes 4')
  check(r.uniqueItemNames === 3, 'mixed: uniqueItemNames 3')
  check(r.intakesWithVariant === 2, 'mixed: withVariant 2')
  check(r.intakesWithoutVariant === 2, 'mixed: withoutVariant 2')
  check(r.variantRate === 50, 'mixed: variantRate 50')
  check(r.uniqueItemVariants === 2, 'mixed: uniqueVariants 2')
}

// 6. Top name by count: Rice×3 beats Oil×2
{
  const r = projectShopWebsiteIntakeItemBrief(state([
    intake({ itemName: 'Rice' }),
    intake({ itemName: 'Oil' }),
    intake({ itemName: 'Rice' }),
    intake({ itemName: 'Oil' }),
    intake({ itemName: 'Rice' }),
  ]))
  check(r.topItemNamesByCount[0].itemName === 'Rice', 'top-name: first is Rice')
  check(r.topItemNamesByCount[0].count === 3, 'top-name: Rice count 3')
  check(r.topItemNamesByCount[1].itemName === 'Oil', 'top-name: second is Oil')
}

// 7. Tie-break: same count → lexicographic on itemName
{
  const r = projectShopWebsiteIntakeItemBrief(state([
    intake({ itemName: 'Zebra Sauce' }),
    intake({ itemName: 'Apple Juice' }),
  ]))
  check(r.topItemNamesByCount[0].itemName === 'Apple Juice', 'tiebreak: Apple before Zebra')
}

console.log(JSON.stringify({ ok: true, checks }))
