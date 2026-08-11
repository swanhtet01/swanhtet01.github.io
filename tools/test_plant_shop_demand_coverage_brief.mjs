// Plant shop demand coverage brief: % of jobs demand-driven, uncovered units, source SKUs/orders.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantShopDemandCoverageBrief } from './plant-shop-demand-coverage-brief.ts'`,
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

const { projectPlantShopDemandCoverageBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v1'

function demand({ sku = 'SKU-A', productName = 'Product A', recommendedBatchUnits = 100, uncoveredDemandUnits = 20, sourceOrderIds = ['ORD-1'] } = {}) {
  return {
    contract: 'supermega.production.shop-demand-source.v1',
    sourceDigest: 'digest-abc',
    evidenceReference: 'EV-1',
    snapshot: {
      schema: 'supermega.commerce.shop-demand-snapshot.v1',
      operatingUnitLocationId: 'LOC-1',
      sku,
      productName,
      sourceOrderIds,
      activeDemandUnits: 50,
      uncoveredDemandUnits,
      availableToPromiseUnits: 30,
      reorderAtUnits: 10,
      replenishmentGapUnits: uncoveredDemandUnits,
      recommendedBatchUnits,
    },
  }
}

function job({ id = 'JOB-1', product = 'Product A', shopDemandSource } = {}) {
  const base = {
    id, line: 'line-a', product, target: 100, output: 0,
    startAt: '2026-01-01T06:00:00Z', dueAt: '2026-01-01T14:00:00Z',
  }
  if (shopDemandSource !== undefined) base.shopDemandSource = shopDemandSource
  return base
}

function state(jobs = []) {
  return { schema: SCHEMA, revision: 1, jobs, issues: [], machines: [], events: [] }
}

// 1. Empty state
{
  const r = projectPlantShopDemandCoverageBrief(state([]))
  check(r.totalJobs === 0, 'empty: totalJobs 0')
  check(r.jobsWithShopDemand === 0, 'empty: jobsWithShopDemand 0')
  check(r.jobsWithoutShopDemand === 0, 'empty: jobsWithoutShopDemand 0')
  check(r.shopDemandCoverage === 0, 'empty: shopDemandCoverage 0')
  check(r.uniqueSkusInDemand === 0, 'empty: uniqueSkusInDemand 0')
  check(r.totalSourceOrders === 0, 'empty: totalSourceOrders 0')
}

// 2. Single job without demand source
{
  const r = projectPlantShopDemandCoverageBrief(state([job({ id: 'JOB-1' })]))
  check(r.totalJobs === 1, 'no-demand: totalJobs 1')
  check(r.jobsWithoutShopDemand === 1, 'no-demand: jobsWithoutShopDemand 1')
  check(r.jobsWithShopDemand === 0, 'no-demand: jobsWithShopDemand 0')
  check(r.shopDemandCoverage === 0, 'no-demand: shopDemandCoverage 0')
}

// 3. Single job with demand source
{
  const src = demand({ sku: 'SKU-A', recommendedBatchUnits: 200, uncoveredDemandUnits: 50, sourceOrderIds: ['ORD-1', 'ORD-2'] })
  const r = projectPlantShopDemandCoverageBrief(state([job({ id: 'JOB-1', shopDemandSource: src })]))
  check(r.jobsWithShopDemand === 1, 'single-demand: jobsWithShopDemand 1')
  check(r.shopDemandCoverage === 100, 'single-demand: shopDemandCoverage 100')
  check(r.totalRecommendedBatchUnits === 200, 'single-demand: totalRecommendedBatchUnits 200')
  check(r.totalUncoveredDemandUnits === 50, 'single-demand: totalUncoveredDemandUnits 50')
  check(r.uniqueSkusInDemand === 1, 'single-demand: uniqueSkusInDemand 1')
  check(r.totalSourceOrders === 2, 'single-demand: totalSourceOrders 2')
}

// 4. Mixed jobs: 2 demand-linked, 1 unlinked → 67% coverage
{
  const src = demand({ sku: 'SKU-A', recommendedBatchUnits: 100, uncoveredDemandUnits: 10, sourceOrderIds: ['ORD-1'] })
  const r = projectPlantShopDemandCoverageBrief(state([
    job({ id: 'JOB-1', shopDemandSource: src }),
    job({ id: 'JOB-2', shopDemandSource: src }),
    job({ id: 'JOB-3' }),
  ]))
  check(r.totalJobs === 3, 'mixed: totalJobs 3')
  check(r.jobsWithShopDemand === 2, 'mixed: jobsWithShopDemand 2')
  check(r.jobsWithoutShopDemand === 1, 'mixed: jobsWithoutShopDemand 1')
  check(r.shopDemandCoverage === 67, 'mixed: shopDemandCoverage 67')
}

// 5. Two jobs same SKU → uniqueSkusInDemand = 1
{
  const srcA = demand({ sku: 'SKU-X', sourceOrderIds: ['ORD-1'] })
  const srcB = demand({ sku: 'SKU-X', sourceOrderIds: ['ORD-2'] })
  const r = projectPlantShopDemandCoverageBrief(state([
    job({ id: 'JOB-1', shopDemandSource: srcA }),
    job({ id: 'JOB-2', shopDemandSource: srcB }),
  ]))
  check(r.uniqueSkusInDemand === 1, 'dedup-sku: uniqueSkusInDemand 1')
  check(r.totalSourceOrders === 2, 'dedup-sku: totalSourceOrders 2 (different orders)')
}

// 6. Two jobs with same source order → totalSourceOrders deduped
{
  const srcA = demand({ sku: 'SKU-A', sourceOrderIds: ['ORD-SHARED', 'ORD-1'] })
  const srcB = demand({ sku: 'SKU-B', sourceOrderIds: ['ORD-SHARED', 'ORD-2'] })
  const r = projectPlantShopDemandCoverageBrief(state([
    job({ id: 'JOB-1', shopDemandSource: srcA }),
    job({ id: 'JOB-2', shopDemandSource: srcB }),
  ]))
  check(r.uniqueSkusInDemand === 2, 'dedup-orders: uniqueSkusInDemand 2')
  check(r.totalSourceOrders === 3, 'dedup-orders: totalSourceOrders 3 (ORD-SHARED counted once)')
}

// 7. Accumulate batchUnits and uncoveredDemandUnits across multiple demand jobs
{
  const src1 = demand({ recommendedBatchUnits: 150, uncoveredDemandUnits: 30, sourceOrderIds: ['ORD-1'] })
  const src2 = demand({ sku: 'SKU-B', recommendedBatchUnits: 250, uncoveredDemandUnits: 70, sourceOrderIds: ['ORD-2'] })
  const r = projectPlantShopDemandCoverageBrief(state([
    job({ id: 'JOB-1', shopDemandSource: src1 }),
    job({ id: 'JOB-2', shopDemandSource: src2 }),
  ]))
  check(r.totalRecommendedBatchUnits === 400, 'accum: totalRecommendedBatchUnits 400')
  check(r.totalUncoveredDemandUnits === 100, 'accum: totalUncoveredDemandUnits 100')
}

console.log(JSON.stringify({ ok: true, checks }))
