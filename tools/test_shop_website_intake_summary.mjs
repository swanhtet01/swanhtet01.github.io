// Shop website intake summary: totalIntakes, pendingConfirmation, converted,
// conversionRate (%), totalQuantityRequested, totalValueRequested, uniqueSkus.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopWebsiteIntakeSummary } from './shop-website-intake-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/intake-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopWebsiteIntakeSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const PROOF = { actionId: 'act1', capturedAt: '2026-08-11T08:00:00.000Z', actor: 'op1' }
let seq = 0

function intake({ sku = 'SKU-A', quantity, unitPrice = 5_000, total, status = 'pending_confirmation' }) {
  seq++
  return {
    id: `wi-${seq}`,
    createdAt: '2026-08-11T08:00:00.000Z',
    status,
    source: { kind: 'website', url: 'https://example.com' },
    sku,
    quantity,
    itemName: `Item ${sku}`,
    unitPrice,
    total: total ?? quantity * unitPrice,
    creation: PROOF,
  }
}

function state(websiteIntakes = undefined) {
  return {
    items: [], orders: [], movements: [], closes: [],
    ...(websiteIntakes !== undefined ? { websiteIntakes } : {}),
  }
}

// 1. Empty state (no field) → all zeros
{
  const r = projectShopWebsiteIntakeSummary(state())
  check(r.totalIntakes === 0, 'empty: totalIntakes 0')
  check(r.pendingConfirmation === 0, 'empty: pendingConfirmation 0')
  check(r.converted === 0, 'empty: converted 0')
  check(r.conversionRate === 0, 'empty: conversionRate 0')
  check(r.totalQuantityRequested === 0, 'empty: totalQuantityRequested 0')
  check(r.totalValueRequested === 0, 'empty: totalValueRequested 0')
  check(r.uniqueSkus === 0, 'empty: uniqueSkus 0')
}

// 2. Empty array → same
{
  const r = projectShopWebsiteIntakeSummary(state([]))
  check(r.totalIntakes === 0, 'empty-array: totalIntakes 0')
}

// 3. Single pending intake
{
  const r = projectShopWebsiteIntakeSummary(state([
    intake({ sku: 'SKU-A', quantity: 2, unitPrice: 10_000, total: 20_000, status: 'pending_confirmation' }),
  ]))
  check(r.totalIntakes === 1, 'single: totalIntakes 1')
  check(r.pendingConfirmation === 1, 'single: pendingConfirmation 1')
  check(r.converted === 0, 'single: converted 0')
  check(r.conversionRate === 0, 'single: conversionRate 0 (0/1=0%)')
  check(r.totalQuantityRequested === 2, 'single: totalQuantityRequested 2')
  check(r.totalValueRequested === 20_000, 'single: totalValueRequested 20000')
  check(r.uniqueSkus === 1, 'single: uniqueSkus 1')
}

// 4. Single converted intake
{
  const r = projectShopWebsiteIntakeSummary(state([
    intake({ sku: 'SKU-B', quantity: 5, unitPrice: 8_000, total: 40_000, status: 'converted' }),
  ]))
  check(r.pendingConfirmation === 0, 'converted: pendingConfirmation 0')
  check(r.converted === 1, 'converted: converted 1')
  check(r.conversionRate === 100, 'converted: conversionRate 100 (1/1=100%)')
}

// 5. Mixed: 1 converted, 3 pending → conversionRate = Math.round(25) = 25%
{
  const r = projectShopWebsiteIntakeSummary(state([
    intake({ qty: 1, quantity: 1, status: 'converted' }),
    intake({ qty: 1, quantity: 1, status: 'pending_confirmation' }),
    intake({ qty: 1, quantity: 1, status: 'pending_confirmation' }),
    intake({ qty: 1, quantity: 1, status: 'pending_confirmation' }),
  ]))
  check(r.totalIntakes === 4, 'mixed: totalIntakes 4')
  check(r.converted === 1, 'mixed: converted 1')
  check(r.pendingConfirmation === 3, 'mixed: pendingConfirmation 3')
  check(r.conversionRate === 25, 'mixed: conversionRate 25%')
}

// 6. conversionRate rounds: 2 converted / 3 total = 66.67 → Math.round → 67
{
  const r = projectShopWebsiteIntakeSummary(state([
    intake({ quantity: 1, status: 'converted' }),
    intake({ quantity: 1, status: 'converted' }),
    intake({ quantity: 1, status: 'pending_confirmation' }),
  ]))
  check(r.conversionRate === 67, 'conv-round: Math.round(66.67)=67')
}

// 7. totalQuantityRequested and totalValueRequested accumulate
{
  const r = projectShopWebsiteIntakeSummary(state([
    intake({ sku: 'SKU-A', quantity: 3, unitPrice: 5_000, total: 15_000 }),
    intake({ sku: 'SKU-B', quantity: 7, unitPrice: 3_000, total: 21_000 }),
  ]))
  check(r.totalQuantityRequested === 10, 'accum: totalQuantityRequested 3+7=10')
  check(r.totalValueRequested === 36_000, 'accum: totalValueRequested 15k+21k=36k')
}

// 8. uniqueSkus: same sku across multiple intakes → counted once
{
  const r = projectShopWebsiteIntakeSummary(state([
    intake({ sku: 'SKU-X', quantity: 1 }),
    intake({ sku: 'SKU-X', quantity: 2 }),
    intake({ sku: 'SKU-Y', quantity: 1 }),
  ]))
  check(r.uniqueSkus === 2, 'unique-skus: SKU-X and SKU-Y → 2')
  check(r.totalQuantityRequested === 4, 'unique-skus: totalQuantityRequested 1+2+1=4')
}

console.log(JSON.stringify({ ok: true, checks }))
