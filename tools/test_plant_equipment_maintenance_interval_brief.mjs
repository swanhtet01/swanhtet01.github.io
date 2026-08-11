// Plant equipment maintenance interval brief: intervalDays + maintenanceOwner on strategies.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentMaintenanceIntervalBrief } from './plant-equipment-maintenance-interval-brief.ts'`,
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

const { projectPlantEquipmentMaintenanceIntervalBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let assetId = 0
function strategy({ intervalDays = 90, maintenanceOwner = 'maint-01' } = {}) {
  assetId++
  return {
    revision: 1,
    actionId: `strat-${assetId}`,
    savedAt: '2026-08-11T08:00:00Z',
    savedBy: 'manager-01',
    maintenanceOwner,
    intervalDays,
    nextDueAt: '2026-09-01',
    procedureReference: 'PM-001',
    safetyBaselineReference: 'SB-001',
  }
}

function asset({ intervalDays, maintenanceOwner, withStrategy = true } = {}) {
  assetId++
  return {
    id: `eq-${assetId}`,
    name: `Equipment ${assetId}`,
    workCentreId: 'wc-01',
    criticality: 'high',
    owner: 'plant-01',
    commissioningStatus: 'commissioned',
    importedAt: '2026-08-01',
    sourceActionId: `sa-${assetId}`,
    sourcePackageDigest: `digest-${assetId}`,
    ...(withStrategy && {
      maintenanceStrategy: strategy({ intervalDays: intervalDays ?? 90, maintenanceOwner: maintenanceOwner ?? 'maint-01' }),
    }),
  }
}

function state(assets) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 1,
    jobs: [],
    issues: [],
    machines: [],
    events: [],
    ...(assets !== undefined && {
      equipmentMaster: {
        contract: 'supermega.production.equipment-master.v1',
        assets,
      },
    }),
  }
}

// 1. No equipmentMaster → all zeros, nulls
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state(undefined))
  check(r.totalStrategies === 0, 'no-master: total 0')
  check(r.totalIntervalDays === 0, 'no-master: totalDays 0')
  check(r.averageIntervalDays === 0, 'no-master: avg 0')
  check(r.minIntervalDays === null, 'no-master: min null')
  check(r.maxIntervalDays === null, 'no-master: max null')
  check(r.uniqueOwners === 0, 'no-master: uniqueOwners 0')
  check(r.topOwnersByStrategies.length === 0, 'no-master: top empty')
}

// 2. Asset without strategy → not counted
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([asset({ withStrategy: false })]))
  check(r.totalStrategies === 0, 'no-strategy: total 0')
}

// 3. Single asset with strategy
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([asset({ intervalDays: 90 })]))
  check(r.totalStrategies === 1, 'single: total 1')
  check(r.totalIntervalDays === 90, 'single: totalDays 90')
  check(r.averageIntervalDays === 90, 'single: avg 90')
  check(r.minIntervalDays === 90, 'single: min 90')
  check(r.maxIntervalDays === 90, 'single: max 90')
  check(r.uniqueOwners === 1, 'single: uniqueOwners 1')
}

// 4. Two strategies, different intervals — min/max tracking
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([
    asset({ intervalDays: 30 }),
    asset({ intervalDays: 365 }),
  ]))
  check(r.totalStrategies === 2, 'two: total 2')
  check(r.minIntervalDays === 30, 'two: min 30')
  check(r.maxIntervalDays === 365, 'two: max 365')
  check(r.totalIntervalDays === 395, 'two: total 395')
}

// 5. Average rounds — 30 + 31 = 61 / 2 = 30.5 → 31
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([
    asset({ intervalDays: 30 }),
    asset({ intervalDays: 31 }),
  ]))
  check(r.averageIntervalDays === 31, 'round: avg 31 (Math.round(30.5))')
}

// 6. Same owner — accumulates
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([
    asset({ maintenanceOwner: 'maint-01' }),
    asset({ maintenanceOwner: 'maint-01' }),
  ]))
  check(r.uniqueOwners === 1, 'same-owner: unique 1')
  check(r.topOwnersByStrategies[0].count === 2, 'same-owner: count 2')
}

// 7. Two owners
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([
    asset({ maintenanceOwner: 'maint-01' }),
    asset({ maintenanceOwner: 'maint-02' }),
  ]))
  check(r.uniqueOwners === 2, 'two-owners: unique 2')
}

// 8. Top owners sort by count desc, secondary alphabetical
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([
    asset({ maintenanceOwner: 'owner-B' }),
    asset({ maintenanceOwner: 'owner-A' }),
    asset({ maintenanceOwner: 'owner-A' }),
  ]))
  check(r.topOwnersByStrategies[0].owner === 'owner-A', 'sort: owner-A first (count 2)')
  check(r.topOwnersByStrategies[1].owner === 'owner-B', 'sort: owner-B second (count 1)')
}

// 9. Secondary sort: same count → alphabetical
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([
    asset({ maintenanceOwner: 'zz-owner' }),
    asset({ maintenanceOwner: 'aa-owner' }),
  ]))
  check(r.topOwnersByStrategies[0].owner === 'aa-owner', 'secondary: aa before zz')
}

// 10. 6 owners → top 5
{
  const assets = ['A', 'B', 'C', 'D', 'E', 'F'].map(o => asset({ maintenanceOwner: `owner-${o}` }))
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state(assets))
  check(r.uniqueOwners === 6, 'top-5: unique 6')
  check(r.topOwnersByStrategies.length === 5, 'top-5: capped at 5')
}

// 11. Mixed: assets with and without strategies
{
  const r = projectPlantEquipmentMaintenanceIntervalBrief(state([
    asset({ intervalDays: 60 }),
    asset({ withStrategy: false }),
    asset({ intervalDays: 120 }),
  ]))
  check(r.totalStrategies === 2, 'mixed: total 2')
  check(r.averageIntervalDays === 90, 'mixed: avg 90')
  check(r.minIntervalDays === 60, 'mixed: min 60')
}

console.log(JSON.stringify({ ok: true, checks }))
