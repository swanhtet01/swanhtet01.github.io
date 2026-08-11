// Plant equipment master summary: loaded, totalAssets, commissionedAssets, notCommissionedAssets,
// byCriticality, assetsWithMaintenanceStrategy, uniqueWorkCentres, uniqueOwners.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentMasterSummary } from './plant-equipment-master-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/equipment-master-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantEquipmentMasterSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const STRATEGY = {
  revision: 1, actionId: 'act1', savedAt: '2026-08-11T08:00:00.000Z', savedBy: 'op1',
  maintenanceOwner: 'op1', intervalDays: 90, nextDueAt: '2026-11-01T00:00:00.000Z',
  procedureReference: 'PROC-1', safetyBaselineReference: 'SAFETY-1',
}

let seq = 0
function asset({
  criticality = 'medium',
  commissioningStatus = 'commissioned',
  workCentreId = 'WC-A',
  owner = 'OP-1',
  maintenanceStrategy = undefined,
} = {}) {
  seq++
  return {
    id: `ASSET-${seq}`,
    name: `Machine ${seq}`,
    workCentreId,
    criticality,
    owner,
    commissioningStatus,
    sourceActionId: 'act1',
    sourcePackageDigest: 'pkg',
    importedAt: '2026-08-11T08:00:00.000Z',
    ...(maintenanceStrategy !== undefined ? { maintenanceStrategy } : {}),
  }
}

function master(assets = []) {
  return { contract: 'supermega.production.equipment-master.v1', assets }
}

function state(equipmentMaster = undefined) {
  return {
    schema: 'supermega.production.v1',
    revision: 1,
    jobs: [], issues: [], machines: [], events: [],
    ...(equipmentMaster !== undefined ? { equipmentMaster } : {}),
  }
}

// 1. No equipmentMaster → all defaults, loaded false
{
  const r = projectPlantEquipmentMasterSummary(state())
  check(r.loaded === false, 'none: loaded false')
  check(r.totalAssets === 0, 'none: totalAssets 0')
  check(r.commissionedAssets === 0, 'none: commissionedAssets 0')
  check(r.notCommissionedAssets === 0, 'none: notCommissionedAssets 0')
  check(r.byCriticality.critical === 0, 'none: critical 0')
  check(r.byCriticality.high === 0, 'none: high 0')
  check(r.byCriticality.medium === 0, 'none: medium 0')
  check(r.byCriticality.low === 0, 'none: low 0')
  check(r.assetsWithMaintenanceStrategy === 0, 'none: assetsWithMaintenanceStrategy 0')
  check(r.uniqueWorkCentres === 0, 'none: uniqueWorkCentres 0')
  check(r.uniqueOwners === 0, 'none: uniqueOwners 0')
}

// 2. Empty assets → loaded true, all zeros
{
  const r = projectPlantEquipmentMasterSummary(state(master([])))
  check(r.loaded === true, 'empty-assets: loaded true')
  check(r.totalAssets === 0, 'empty-assets: totalAssets 0')
}

// 3. Single commissioned critical asset, with maintenance strategy
{
  const r = projectPlantEquipmentMasterSummary(state(master([
    asset({ criticality: 'critical', commissioningStatus: 'commissioned', workCentreId: 'WC-1', owner: 'OP-A', maintenanceStrategy: STRATEGY }),
  ])))
  check(r.loaded === true, 'single: loaded true')
  check(r.totalAssets === 1, 'single: totalAssets 1')
  check(r.commissionedAssets === 1, 'single: commissionedAssets 1')
  check(r.notCommissionedAssets === 0, 'single: notCommissionedAssets 0')
  check(r.byCriticality.critical === 1, 'single: critical 1')
  check(r.assetsWithMaintenanceStrategy === 1, 'single: assetsWithMaintenanceStrategy 1')
  check(r.uniqueWorkCentres === 1, 'single: uniqueWorkCentres 1')
  check(r.uniqueOwners === 1, 'single: uniqueOwners 1')
}

// 4. not_commissioned increments notCommissionedAssets
{
  const r = projectPlantEquipmentMasterSummary(state(master([
    asset({ commissioningStatus: 'not_commissioned' }),
  ])))
  check(r.notCommissionedAssets === 1, 'not-comm: notCommissionedAssets 1')
  check(r.commissionedAssets === 0, 'not-comm: commissionedAssets 0')
}

// 5. byCriticality all four kinds
{
  const r = projectPlantEquipmentMasterSummary(state(master([
    asset({ criticality: 'critical' }),
    asset({ criticality: 'high' }),
    asset({ criticality: 'medium' }),
    asset({ criticality: 'low' }),
  ])))
  check(r.byCriticality.critical === 1, 'all-crit: critical 1')
  check(r.byCriticality.high === 1, 'all-crit: high 1')
  check(r.byCriticality.medium === 1, 'all-crit: medium 1')
  check(r.byCriticality.low === 1, 'all-crit: low 1')
}

// 6. assetsWithMaintenanceStrategy: 1 with, 1 without
{
  const r = projectPlantEquipmentMasterSummary(state(master([
    asset({ maintenanceStrategy: STRATEGY }),
    asset({ maintenanceStrategy: undefined }),
  ])))
  check(r.assetsWithMaintenanceStrategy === 1, 'strat-partial: assetsWithMaintenanceStrategy 1')
}

// 7. uniqueWorkCentres dedup: 2 assets same WC → 1
{
  const r = projectPlantEquipmentMasterSummary(state(master([
    asset({ workCentreId: 'WC-X' }),
    asset({ workCentreId: 'WC-X' }),
  ])))
  check(r.uniqueWorkCentres === 1, 'wc-dedup: uniqueWorkCentres 1')
}

// 8. uniqueOwners: 2 distinct owners → 2
{
  const r = projectPlantEquipmentMasterSummary(state(master([
    asset({ owner: 'OP-A' }),
    asset({ owner: 'OP-B' }),
  ])))
  check(r.uniqueOwners === 2, 'owners-dist: uniqueOwners 2')
}

// 9. Mixed commissioned/not-commissioned: 2 + 1
{
  const r = projectPlantEquipmentMasterSummary(state(master([
    asset({ commissioningStatus: 'commissioned' }),
    asset({ commissioningStatus: 'commissioned' }),
    asset({ commissioningStatus: 'not_commissioned' }),
  ])))
  check(r.commissionedAssets === 2, 'mix-comm: commissionedAssets 2')
  check(r.notCommissionedAssets === 1, 'mix-comm: notCommissionedAssets 1')
  check(r.totalAssets === 3, 'mix-comm: totalAssets 3')
}

console.log(JSON.stringify({ ok: true, checks }))
