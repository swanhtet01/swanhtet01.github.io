// Plant equipment asset status brief: commissioningStatus enum + workCentreId distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentAssetStatusBrief } from './plant-equipment-asset-status-brief.ts'`,
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

const { projectPlantEquipmentAssetStatusBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'
const DIGEST = 'sha256:' + 'a'.repeat(64)

let assetId = 0
function asset(commissioningStatus, workCentreId) {
  assetId++
  return {
    id: `ASSET-${assetId}`,
    name: `Asset ${assetId}`,
    workCentreId,
    criticality: 'medium',
    owner: 'tech-1',
    commissioningStatus,
    sourceActionId: 'ACT-1',
    sourcePackageDigest: DIGEST,
    importedAt: '2026-08-01T09:00:00Z',
  }
}

function state(assets) {
  return {
    schema: SCHEMA,
    jobs: [],
    issues: [],
    events: [],
    closes: [],
    equipmentMaster: assets !== undefined ? { assets, sourcePackageDigest: DIGEST } : undefined,
  }
}

// 1. No equipment master → all zeros
{
  const r = projectPlantEquipmentAssetStatusBrief(state(undefined))
  check(r.totalAssets === 0, 'empty: totalAssets 0')
  check(r.commissionedCount === 0, 'empty: commissionedCount 0')
  check(r.notCommissionedCount === 0, 'empty: notCommissionedCount 0')
  check(r.commissionedRate === 0, 'empty: commissionedRate 0')
  check(r.uniqueWorkCentres === 0, 'empty: uniqueWorkCentres 0')
  check(r.topWorkCentresByCount.length === 0, 'empty: topWorkCentresByCount empty')
}

// 2. All commissioned
{
  const r = projectPlantEquipmentAssetStatusBrief(
    state([asset('commissioned', 'WC-1'), asset('commissioned', 'WC-1')]),
  )
  check(r.totalAssets === 2, 'all-commissioned: totalAssets 2')
  check(r.commissionedCount === 2, 'all-commissioned: commissionedCount 2')
  check(r.notCommissionedCount === 0, 'all-commissioned: notCommissionedCount 0')
  check(r.commissionedRate === 100, 'all-commissioned: commissionedRate 100')
}

// 3. All not commissioned
{
  const r = projectPlantEquipmentAssetStatusBrief(
    state([asset('not_commissioned', 'WC-1'), asset('not_commissioned', 'WC-2')]),
  )
  check(r.commissionedCount === 0, 'all-not: commissionedCount 0')
  check(r.notCommissionedCount === 2, 'all-not: notCommissionedCount 2')
  check(r.commissionedRate === 0, 'all-not: commissionedRate 0')
}

// 4. Mixed → rate
{
  const r = projectPlantEquipmentAssetStatusBrief(
    state([
      asset('commissioned', 'WC-1'),
      asset('commissioned', 'WC-1'),
      asset('commissioned', 'WC-2'),
      asset('not_commissioned', 'WC-2'),
    ]),
  )
  check(r.commissionedCount === 3, 'mixed: commissionedCount 3')
  check(r.notCommissionedCount === 1, 'mixed: notCommissionedCount 1')
  check(r.commissionedRate === 75, 'mixed: commissionedRate 75')
}

// 5. Work centre distribution
{
  const r = projectPlantEquipmentAssetStatusBrief(
    state([
      asset('commissioned', 'WC-1'),
      asset('commissioned', 'WC-1'),
      asset('commissioned', 'WC-2'),
    ]),
  )
  check(r.uniqueWorkCentres === 2, 'wc-dist: uniqueWorkCentres 2')
  check(r.topWorkCentresByCount[0]?.workCentreId === 'WC-1', 'wc-dist: top WC-1')
  check(r.topWorkCentresByCount[0]?.count === 2, 'wc-dist: count 2')
}

// 6. Top-5 cap + tiebreak
{
  const wcs = ['WC-Z', 'WC-A', 'WC-C', 'WC-B', 'WC-D', 'WC-E']
  const r = projectPlantEquipmentAssetStatusBrief(
    state(wcs.map(wc => asset('commissioned', wc))),
  )
  check(r.topWorkCentresByCount.length === 5, 'top5: capped at 5')
  check(r.topWorkCentresByCount[0]?.workCentreId === 'WC-A', 'top5: tiebreak WC-A first')
}

console.log(JSON.stringify({ ok: true, checks }))
