// Plant equipment strategy reference brief: procedureReference and safetyBaselineReference distributions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentStrategyReferenceBrief } from './plant-equipment-strategy-reference-brief.ts'`,
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

const { projectPlantEquipmentStrategyReferenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'
const PROOF = { actionId: 'ACT-1', actorId: 'user-1', timestamp: '2026-08-12T09:00:00Z' }

let assetId = 0

function strategy(procedureReference, safetyBaselineReference) {
  return {
    revision: 1,
    actionId: 'ACT-STR-1',
    savedAt: '2026-08-01T09:00:00Z',
    savedBy: 'engineer-1',
    maintenanceOwner: 'technician-1',
    intervalDays: 90,
    nextDueAt: '2026-11-01T00:00:00Z',
    procedureReference,
    safetyBaselineReference,
  }
}

function asset(maintenanceStrategy) {
  assetId++
  const base = {
    id: `ASSET-${assetId}`,
    actionId: 'ACT-ASSET-1',
    name: `Machine ${assetId}`,
    criticality: 'high',
    workCentreId: 'WC-1',
    owner: 'engineer-1',
    createdAt: '2026-08-01T00:00:00Z',
  }
  if (maintenanceStrategy !== undefined) base.maintenanceStrategy = maintenanceStrategy
  return base
}

function master(assets = []) {
  return { actionId: 'ACT-MASTER-1', loadedAt: '2026-08-01T00:00:00Z', loadedBy: 'admin-1', assets }
}

function state(equipmentMaster) {
  return {
    schema: SCHEMA,
    revision: 1,
    jobs: [],
    issues: [],
    machines: [],
    events: [],
    ...(equipmentMaster !== undefined ? { equipmentMaster } : {}),
  }
}

// 1. No equipmentMaster → all zeros
{
  const r = projectPlantEquipmentStrategyReferenceBrief(state(undefined))
  check(r.totalAssets === 0, 'no-master: totalAssets 0')
  check(r.assetsWithStrategy === 0, 'no-master: assetsWithStrategy 0')
  check(r.strategyRate === 0, 'no-master: strategyRate 0')
  check(r.uniqueProcedureReferences === 0, 'no-master: uniqueProcedureReferences 0')
  check(r.uniqueSafetyBaselineReferences === 0, 'no-master: uniqueSafetyBaselineReferences 0')
}

// 2. Asset with no strategy
{
  const r = projectPlantEquipmentStrategyReferenceBrief(state(master([asset(undefined)])))
  check(r.totalAssets === 1, 'no-strategy: totalAssets 1')
  check(r.assetsWithStrategy === 0, 'no-strategy: assetsWithStrategy 0')
  check(r.strategyRate === 0, 'no-strategy: strategyRate 0')
}

// 3. Single asset with strategy
{
  const r = projectPlantEquipmentStrategyReferenceBrief(state(master([
    asset(strategy('PROC-001', 'SAFETY-A')),
  ])))
  check(r.totalAssets === 1, 'single: totalAssets 1')
  check(r.assetsWithStrategy === 1, 'single: assetsWithStrategy 1')
  check(r.strategyRate === 100, 'single: strategyRate 100')
  check(r.uniqueProcedureReferences === 1, 'single: uniqueProcedureReferences 1')
  check(r.topProcedureReferencesByCount[0]?.reference === 'PROC-001', 'single: top procedure ref')
  check(r.uniqueSafetyBaselineReferences === 1, 'single: uniqueSafetyBaselineReferences 1')
  check(r.topSafetyBaselineReferencesByCount[0]?.reference === 'SAFETY-A', 'single: top safety ref')
}

// 4. Shared procedure reference across assets
{
  const r = projectPlantEquipmentStrategyReferenceBrief(state(master([
    asset(strategy('PROC-001', 'SAFETY-A')),
    asset(strategy('PROC-001', 'SAFETY-B')),
    asset(strategy('PROC-002', 'SAFETY-A')),
  ])))
  check(r.totalAssets === 3, 'shared: totalAssets 3')
  check(r.assetsWithStrategy === 3, 'shared: assetsWithStrategy 3')
  check(r.uniqueProcedureReferences === 2, 'shared: uniqueProcedureReferences 2')
  check(r.topProcedureReferencesByCount[0]?.reference === 'PROC-001', 'shared: top procedure PROC-001')
  check(r.topProcedureReferencesByCount[0]?.count === 2, 'shared: top procedure count 2')
  check(r.uniqueSafetyBaselineReferences === 2, 'shared: uniqueSafetyBaselineReferences 2')
}

// 5. Mixed: one with strategy, one without → 50% rate
{
  const r = projectPlantEquipmentStrategyReferenceBrief(state(master([
    asset(strategy('PROC-A', 'SAFETY-1')),
    asset(undefined),
  ])))
  check(r.assetsWithStrategy === 1, 'mixed: assetsWithStrategy 1')
  check(r.strategyRate === 50, 'mixed: strategyRate 50')
}

// 6. Top-5 cap for procedure references: 6 distinct → capped at 5
{
  const refs = ['PROC-F', 'PROC-A', 'PROC-C', 'PROC-B', 'PROC-D', 'PROC-E']
  const assets = refs.map(r => asset(strategy(r, 'SAFETY-COMMON')))
  const r = projectPlantEquipmentStrategyReferenceBrief(state(master(assets)))
  check(r.uniqueProcedureReferences === 6, 'top5: uniqueProcedureReferences 6')
  check(r.topProcedureReferencesByCount.length === 5, 'top5: capped at 5')
  check(r.topProcedureReferencesByCount[0]?.reference === 'PROC-A', 'top5: tiebreak alphabetic first')
}

console.log(JSON.stringify({ ok: true, checks }))
