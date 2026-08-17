// Plant equipment commissioning safety brief: safetyBaselineReference distribution from equipment assets.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentCommissioningSafetyBrief } from './plant-equipment-commissioning-safety-brief.ts'`,
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

const { projectPlantEquipmentCommissioningSafetyBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let assetId = 0
function asset(safetyBaselineReference) {
  assetId++
  const commission = { actionId: `ACT-${assetId}`, commissionedAt: '2026-01-01T00:00:00Z', commissionedBy: 'eng-1', installedAt: '2026-01-01T00:00:00Z', initialState: 'running' }
  if (safetyBaselineReference !== undefined) commission.safetyBaselineReference = safetyBaselineReference
  return { id: `EQ-${assetId}`, subjectId: `SUB-${assetId}`, label: `Machine ${assetId}`, workCentreId: 'WC-1', criticality: 'medium', commissioningStatus: 'active', commissioning: commission, maintenanceStrategy: null }
}

function assetNoCommissioning() {
  assetId++
  return { id: `EQ-${assetId}`, subjectId: `SUB-${assetId}`, label: `Machine ${assetId}`, workCentreId: 'WC-1', criticality: 'medium', commissioningStatus: 'pending', commissioning: undefined, maintenanceStrategy: null }
}

function state(assets) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 0,
    jobs: [],
    issues: [],
    machines: [],
    events: [],
    openingPlan: null,
    orderExecution: null,
    orderPortfolio: null,
    equipmentMaster: assets.length > 0 ? { assets } : null,
  }
}

function stateNoMaster() {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 0,
    jobs: [],
    issues: [],
    machines: [],
    events: [],
    openingPlan: null,
    orderExecution: null,
    orderPortfolio: null,
    equipmentMaster: null,
  }
}

// 1. No equipment master → all zeros
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(stateNoMaster())
  check(r.totalAssets === 0, 'no-master: totalAssets 0')
  check(r.assetsWithSafetyReference === 0, 'no-master: assetsWithSafetyReference 0')
  check(r.safetyReferencePresenceRate === 0, 'no-master: safetyReferencePresenceRate 0')
  check(r.uniqueSafetyReferences === 0, 'no-master: uniqueSafetyReferences 0')
  check(r.topSafetyReferencesByCount.length === 0, 'no-master: top empty')
}

// 2. Assets without commissioning sub-object skipped
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state([assetNoCommissioning(), assetNoCommissioning()]),
  )
  check(r.totalAssets === 0, 'no-commission: totalAssets 0')
}

// 3. Assets with commissioning but no safetyBaselineReference
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state([asset(), asset()]),
  )
  check(r.totalAssets === 2, 'no-ref: totalAssets 2')
  check(r.assetsWithSafetyReference === 0, 'no-ref: assetsWithSafetyReference 0')
  check(r.safetyReferencePresenceRate === 0, 'no-ref: safetyReferencePresenceRate 0')
  check(r.uniqueSafetyReferences === 0, 'no-ref: uniqueSafetyReferences 0')
}

// 4. Single asset with safetyBaselineReference
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state([asset('SAFE-001')]),
  )
  check(r.totalAssets === 1, 'single: totalAssets 1')
  check(r.assetsWithSafetyReference === 1, 'single: assetsWithSafetyReference 1')
  check(r.safetyReferencePresenceRate === 100, 'single: safetyReferencePresenceRate 100')
  check(r.uniqueSafetyReferences === 1, 'single: uniqueSafetyReferences 1')
  check(r.topSafetyReferencesByCount[0]?.reference === 'SAFE-001', 'single: top reference')
  check(r.topSafetyReferencesByCount[0]?.count === 1, 'single: top count 1')
}

// 5. Multiple assets — reference distribution
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state([asset('SAFE-001'), asset('SAFE-001'), asset('SAFE-002')]),
  )
  check(r.totalAssets === 3, 'dist: totalAssets 3')
  check(r.assetsWithSafetyReference === 3, 'dist: assetsWithSafetyReference 3')
  check(r.safetyReferencePresenceRate === 100, 'dist: safetyReferencePresenceRate 100')
  check(r.uniqueSafetyReferences === 2, 'dist: uniqueSafetyReferences 2')
  check(r.topSafetyReferencesByCount[0]?.reference === 'SAFE-001', 'dist: top SAFE-001')
  check(r.topSafetyReferencesByCount[0]?.count === 2, 'dist: count 2')
}

// 6. Mixed — some with reference, some without
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state([asset('SAFE-001'), asset(), asset('SAFE-002'), asset()]),
  )
  check(r.totalAssets === 4, 'mixed: totalAssets 4')
  check(r.assetsWithSafetyReference === 2, 'mixed: assetsWithSafetyReference 2')
  check(r.safetyReferencePresenceRate === 50, 'mixed: safetyReferencePresenceRate 50')
}

// 7. Top-5 cap + tiebreak
{
  const refs = ['SAFE-Z', 'SAFE-A', 'SAFE-C', 'SAFE-B', 'SAFE-D', 'SAFE-E']
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state(refs.map(ref => asset(ref))),
  )
  check(r.topSafetyReferencesByCount.length === 5, 'top5: capped at 5')
  check(r.topSafetyReferencesByCount[0]?.reference === 'SAFE-A', 'top5: tiebreak SAFE-A first')
}

// 8. Mixed commissioning and non-commissioning assets
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state([asset('SAFE-001'), assetNoCommissioning(), asset('SAFE-001')]),
  )
  check(r.totalAssets === 2, 'mixed-comm: totalAssets 2 (skips non-commissioned)')
  check(r.assetsWithSafetyReference === 2, 'mixed-comm: assetsWithSafetyReference 2')
}

// 9. Presence rate rounds: 1 of 3 → 33%
{
  const r = projectPlantEquipmentCommissioningSafetyBrief(
    state([asset('SAFE-001'), asset(), asset()]),
  )
  check(r.safetyReferencePresenceRate === 33, 'round: presenceRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
