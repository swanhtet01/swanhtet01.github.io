// Phase A cross-product reporting: material reconciliation projection.
// Tests projectMaterialReconciliation by kind, date filter, and multi-SKU aggregation.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectMaterialReconciliation } from './shop-production-reconciliation.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/reconciliation-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectMaterialReconciliation } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// --- Helpers ---

function makeCommerce(movements = []) {
  return { schema: 'supermega.commerce.workspace.v2', items: [], orders: [], movements, closes: [] }
}

function makeMovement(kind, sku, quantityDelta, createdAt = '2026-08-11T10:00:00.000Z', extra = {}) {
  return { id: `MOV-${kind}-${sku}`, actionId: `ACT-${kind}`, createdAt, actor: 'Plant Supervisor', reason: 'Material flow', evidenceReference: `EV-${kind}`, kind, sku, quantityDelta, ...extra }
}

// 1. Empty commerce → empty result
check(projectMaterialReconciliation(makeCommerce([])).length === 0, 'no movements → empty result')

// 2. Non-production movements are excluded
{
  const result = projectMaterialReconciliation(makeCommerce([
    makeMovement('receipt', 'WIDGET-A', 50),
    makeMovement('reserve', 'WIDGET-A', 10),
    makeMovement('return', 'WIDGET-A', 5),
  ]))
  check(result.length === 0, 'non-production movements (receipt/reserve/return) not included')
}

// 3. Single production_issue creates one row
{
  const result = projectMaterialReconciliation(makeCommerce([makeMovement('production_issue', 'RAW-STEEL', 100)]))
  check(result.length === 1, 'one production_issue → one result row')
  check(result[0].sku === 'RAW-STEEL', 'sku correct')
  check(result[0].issuedToPlant === 100, 'issuedToPlant is quantityDelta')
  check(result[0].issueCount === 1, 'issueCount is 1')
  check(result[0].returnedFromPlant === 0, 'no returns')
  check(result[0].receivedFromPlant === 0, 'no receipts')
  check(result[0].netInPlant === 100, 'netInPlant = issued - returned = 100')
}

// 4. Single production_return creates one row
{
  const result = projectMaterialReconciliation(makeCommerce([makeMovement('production_return', 'RAW-STEEL', 20)]))
  check(result[0].returnedFromPlant === 20, 'returnedFromPlant is quantityDelta')
  check(result[0].returnCount === 1, 'returnCount is 1')
  check(result[0].netInPlant === -20, 'netInPlant negative when only returns')
}

// 5. Single production_receipt creates one row
{
  const result = projectMaterialReconciliation(makeCommerce([makeMovement('production_receipt', 'WIDGET-A', 38)]))
  check(result[0].receivedFromPlant === 38, 'receivedFromPlant is quantityDelta')
  check(result[0].receiptCount === 1, 'receiptCount is 1')
  check(result[0].netInPlant === 0, 'netInPlant unaffected by receipts (finished goods)')
}

// 6. All three kinds for same SKU aggregated in one row
{
  const result = projectMaterialReconciliation(makeCommerce([
    makeMovement('production_issue', 'RAW-STEEL', 100, '2026-08-11T08:00:00.000Z'),
    makeMovement('production_return', 'RAW-STEEL', 20, '2026-08-11T09:00:00.000Z', { id: 'MOV-R2' }),
    makeMovement('production_receipt', 'RAW-STEEL', 80, '2026-08-11T10:00:00.000Z', { id: 'MOV-R3' }),
  ]))
  check(result.length === 1, 'all three kinds for same SKU → one row')
  check(result[0].issuedToPlant === 100, 'issued correct')
  check(result[0].returnedFromPlant === 20, 'returned correct')
  check(result[0].receivedFromPlant === 80, 'received correct')
  check(result[0].netInPlant === 80, 'netInPlant = 100 - 20 = 80')
}

// 7. Multiple SKUs produce separate rows
{
  const result = projectMaterialReconciliation(makeCommerce([
    makeMovement('production_issue', 'RAW-STEEL', 100),
    makeMovement('production_issue', 'RAW-COPPER', 50, '2026-08-11T10:00:00.000Z', { id: 'MOV-2' }),
  ]))
  check(result.length === 2, 'two different SKUs → two result rows')
}

// 8. Multiple issues for same SKU are summed
{
  const result = projectMaterialReconciliation(makeCommerce([
    makeMovement('production_issue', 'RAW-STEEL', 60, '2026-08-11T08:00:00.000Z'),
    makeMovement('production_issue', 'RAW-STEEL', 40, '2026-08-11T09:00:00.000Z', { id: 'MOV-2' }),
  ]))
  check(result[0].issuedToPlant === 100, 'multiple issues summed')
  check(result[0].issueCount === 2, 'issueCount is 2')
}

// 9. Date filter: includes movements on the given day
{
  const m = makeMovement('production_issue', 'RAW-STEEL', 100, '2026-08-11T08:00:00.000Z')
  const result = projectMaterialReconciliation(makeCommerce([m]), '2026-08-11')
  check(result.length === 1, 'movement on filtered date is included')
}

// 10. Date filter: excludes movements on other days
{
  const m = makeMovement('production_issue', 'RAW-STEEL', 100, '2026-08-10T23:59:00.000Z')
  const result = projectMaterialReconciliation(makeCommerce([m]), '2026-08-11')
  check(result.length === 0, 'movement on different date excluded by filter')
}

// 11. Date filter: only same-day movements count toward aggregation
{
  const m1 = makeMovement('production_issue', 'RAW-STEEL', 100, '2026-08-11T08:00:00.000Z')
  const m2 = makeMovement('production_issue', 'RAW-STEEL', 50, '2026-08-10T08:00:00.000Z', { id: 'MOV-2' })
  const result = projectMaterialReconciliation(makeCommerce([m1, m2]), '2026-08-11')
  check(result[0].issuedToPlant === 100, 'only same-day movement counted in aggregate')
  check(result[0].issueCount === 1, 'issueCount is 1 with filter')
}

// 12. No date filter → all movements included regardless of date
{
  const m1 = makeMovement('production_issue', 'RAW-STEEL', 60, '2026-08-10T08:00:00.000Z')
  const m2 = makeMovement('production_issue', 'RAW-STEEL', 40, '2026-08-11T08:00:00.000Z', { id: 'MOV-2' })
  const result = projectMaterialReconciliation(makeCommerce([m1, m2]))
  check(result[0].issuedToPlant === 100, 'all movements included without date filter')
  check(result[0].issueCount === 2, 'issueCount is 2 without filter')
}

// 13. netInPlant only reflects issues minus returns (receipts are finished goods, not material)
{
  const result = projectMaterialReconciliation(makeCommerce([
    makeMovement('production_issue', 'WIDGET-A', 40),
    makeMovement('production_receipt', 'WIDGET-A', 38, '2026-08-11T11:00:00.000Z', { id: 'MOV-REC' }),
  ]))
  check(result[0].netInPlant === 40, 'netInPlant ignores receipts; only issued - returned')
}

// 14. Return count and received count track separately
{
  const result = projectMaterialReconciliation(makeCommerce([
    makeMovement('production_return', 'RAW-STEEL', 5, '2026-08-11T09:00:00.000Z'),
    makeMovement('production_return', 'RAW-STEEL', 3, '2026-08-11T10:00:00.000Z', { id: 'MOV-R2' }),
    makeMovement('production_receipt', 'RAW-STEEL', 30, '2026-08-11T11:00:00.000Z', { id: 'MOV-REC' }),
  ]))
  check(result[0].returnCount === 2, 'returnCount sums correctly')
  check(result[0].returnedFromPlant === 8, 'returnedFromPlant sums correctly')
  check(result[0].receiptCount === 1, 'receiptCount correct')
  check(result[0].receivedFromPlant === 30, 'receivedFromPlant correct')
}

// 15. Mixed date: only today's return reduces today's issued
{
  const m1 = makeMovement('production_issue', 'RAW-STEEL', 100, '2026-08-11T08:00:00.000Z')
  const m2 = makeMovement('production_return', 'RAW-STEEL', 10, '2026-08-11T09:00:00.000Z', { id: 'MOV-R2' })
  const m3 = makeMovement('production_return', 'RAW-STEEL', 20, '2026-08-10T09:00:00.000Z', { id: 'MOV-R3' })
  const result = projectMaterialReconciliation(makeCommerce([m1, m2, m3]), '2026-08-11')
  check(result[0].returnedFromPlant === 10, 'only same-day return counted with filter')
  check(result[0].netInPlant === 90, 'net reflects only same-day movements')
}

console.log(`shop-production reconciliation: ${checks} checks passed`)
