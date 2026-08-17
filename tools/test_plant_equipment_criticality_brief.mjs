// Plant equipment criticality brief: criticality enum distribution across assets.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentCriticalityBrief } from './plant-equipment-criticality-brief.ts'`,
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

const { projectPlantEquipmentCriticalityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const DIGEST = 'sha256:' + 'a'.repeat(64)

let assetId = 0
function asset(criticality) {
  assetId++
  return {
    id: `EQ-${assetId}`,
    name: `Machine ${assetId}`,
    workCentreId: `WC-1`,
    criticality,
    owner: 'Plant Ops',
    commissioningStatus: 'not_commissioned',
    sourceActionId: `ACT-${assetId}`,
    sourcePackageDigest: DIGEST,
    importedAt: '2026-01-01T00:00:00Z',
  }
}

function state(assets) {
  const base = { schema: 'supermega.production.workspace.v2', jobs: [], events: [], issues: [], machines: [] }
  if (assets !== undefined) base.equipmentMaster = { contract: 'eq-master-1', assets }
  return base
}

// 1. No equipment master → all zeros
{
  const r = projectPlantEquipmentCriticalityBrief(state(undefined))
  check(r.totalAssets === 0, 'no-master: totalAssets 0')
  check(r.criticalCount === 0, 'no-master: criticalCount 0')
  check(r.highCount === 0, 'no-master: highCount 0')
  check(r.mediumCount === 0, 'no-master: mediumCount 0')
  check(r.lowCount === 0, 'no-master: lowCount 0')
  check(r.criticalRate === 0, 'no-master: criticalRate 0')
  check(r.highRate === 0, 'no-master: highRate 0')
  check(r.mediumRate === 0, 'no-master: mediumRate 0')
  check(r.lowRate === 0, 'no-master: lowRate 0')
}

// 2. Empty assets array → all zeros
{
  const r = projectPlantEquipmentCriticalityBrief(state([]))
  check(r.totalAssets === 0, 'empty: totalAssets 0')
  check(r.criticalRate === 0, 'empty: criticalRate 0')
}

// 3. Single critical asset
{
  const r = projectPlantEquipmentCriticalityBrief(state([asset('critical')]))
  check(r.totalAssets === 1, 'critical-only: totalAssets 1')
  check(r.criticalCount === 1, 'critical-only: criticalCount 1')
  check(r.highCount === 0, 'critical-only: highCount 0')
  check(r.mediumCount === 0, 'critical-only: mediumCount 0')
  check(r.lowCount === 0, 'critical-only: lowCount 0')
  check(r.criticalRate === 100, 'critical-only: criticalRate 100')
  check(r.highRate === 0, 'critical-only: highRate 0')
}

// 4. Single high asset
{
  const r = projectPlantEquipmentCriticalityBrief(state([asset('high')]))
  check(r.highCount === 1, 'high-only: highCount 1')
  check(r.highRate === 100, 'high-only: highRate 100')
  check(r.criticalRate === 0, 'high-only: criticalRate 0')
}

// 5. Single medium asset
{
  const r = projectPlantEquipmentCriticalityBrief(state([asset('medium')]))
  check(r.mediumCount === 1, 'medium-only: mediumCount 1')
  check(r.mediumRate === 100, 'medium-only: mediumRate 100')
}

// 6. Single low asset
{
  const r = projectPlantEquipmentCriticalityBrief(state([asset('low')]))
  check(r.lowCount === 1, 'low-only: lowCount 1')
  check(r.lowRate === 100, 'low-only: lowRate 100')
}

// 7. Mixed: 2 critical, 1 high, 1 medium, 1 low
{
  const assets = [asset('critical'), asset('critical'), asset('high'), asset('medium'), asset('low')]
  const r = projectPlantEquipmentCriticalityBrief(state(assets))
  check(r.totalAssets === 5, 'mixed: totalAssets 5')
  check(r.criticalCount === 2, 'mixed: criticalCount 2')
  check(r.highCount === 1, 'mixed: highCount 1')
  check(r.mediumCount === 1, 'mixed: mediumCount 1')
  check(r.lowCount === 1, 'mixed: lowCount 1')
  check(r.criticalRate === 40, 'mixed: criticalRate 40')
  check(r.highRate === 20, 'mixed: highRate 20')
  check(r.mediumRate === 20, 'mixed: mediumRate 20')
  check(r.lowRate === 20, 'mixed: lowRate 20')
}

// 8. Math.round: 1 critical out of 3 → round(33.33) = 33
{
  const r = projectPlantEquipmentCriticalityBrief(state([asset('critical'), asset('high'), asset('medium')]))
  check(r.criticalRate === 33, 'round: criticalRate 33')
  check(r.highRate === 33, 'round: highRate 33')
  check(r.mediumRate === 33, 'round: mediumRate 33')
}

// 9. Sum of rates can exceed 100 due to rounding (normal for enum distributions)
{
  const assets = [asset('critical'), asset('high'), asset('medium')]
  const r = projectPlantEquipmentCriticalityBrief(state(assets))
  check(r.criticalRate + r.highRate + r.mediumRate + r.lowRate === 99, 'round: sum 99 due to rounding')
}

console.log(JSON.stringify({ ok: true, checks }))
