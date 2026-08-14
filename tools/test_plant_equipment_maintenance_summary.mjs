// Plant equipment maintenance compliance: overdue/dueSoon/onTrack counts from equipmentMaster.assets
// Tests asOf date comparison, criticality, work-centre grouping, and commissioning status.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentMaintenanceSummary } from './plant-equipment-maintenance-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/equip-maint-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantEquipmentMaintenanceSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const ASOF = '2026-08-11'

let seq = 0
function asset({
  commissioningStatus = 'commissioned',
  criticality = 'medium',
  workCentreId = 'WC-1',
  nextDueAt = undefined,
} = {}) {
  seq += 1
  return {
    id: `asset-${seq}`,
    name: `Machine ${seq}`,
    workCentreId,
    criticality,
    owner: 'op1',
    commissioningStatus,
    sourceActionId: `a-${seq}`,
    sourcePackageDigest: 'digest',
    importedAt: '2026-01-01T00:00:00Z',
    ...(nextDueAt !== undefined
      ? { maintenanceStrategy: { revision: 1, actionId: `ms-${seq}`, savedAt: '2026-01-01T00:00:00Z', savedBy: 'op1', maintenanceOwner: 'tech1', intervalDays: 30, nextDueAt, procedureReference: 'PR-1', safetyBaselineReference: 'SB-1' } }
      : {}),
  }
}

function state(assets = []) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 1,
    jobs: [],
    issues: [],
    machines: [],
    events: [],
    ...(assets.length > 0 ? { equipmentMaster: { contract: 'supermega.production.equipment-master.v1', assets } } : {}),
  }
}

// 1. No equipment master → all zeros
{
  const r = projectPlantEquipmentMaintenanceSummary(state(), ASOF)
  check(r.totalAssets === 0, 'empty: totalAssets is 0')
  check(r.commissionedAssets === 0, 'empty: commissionedAssets is 0')
  check(r.withMaintenanceStrategy === 0, 'empty: withMaintenanceStrategy is 0')
  check(r.overdueCount === 0, 'empty: overdueCount is 0')
  check(r.dueSoonCount === 0, 'empty: dueSoonCount is 0')
  check(r.onTrackCount === 0, 'empty: onTrackCount is 0')
  check(r.criticalOverdueCount === 0, 'empty: criticalOverdueCount is 0')
  check(r.byWorkCentre.length === 0, 'empty: byWorkCentre is empty')
}

// 2. Asset with no maintenance strategy → not counted in overdue/dueSoon/onTrack
{
  const r = projectPlantEquipmentMaintenanceSummary(state([asset()]), ASOF)
  check(r.totalAssets === 1, 'no-strategy: totalAssets is 1')
  check(r.commissionedAssets === 1, 'no-strategy: commissionedAssets is 1')
  check(r.withMaintenanceStrategy === 0, 'no-strategy: withMaintenanceStrategy is 0')
  check(r.overdueCount === 0, 'no-strategy: overdueCount is 0')
}

// 3. Asset with nextDueAt before today → overdue
{
  const r = projectPlantEquipmentMaintenanceSummary(state([asset({ nextDueAt: '2026-08-10' })]), ASOF)
  check(r.overdueCount === 1, 'overdue: yesterday is overdue')
  check(r.dueSoonCount === 0, 'overdue: dueSoonCount is 0')
  check(r.onTrackCount === 0, 'overdue: onTrackCount is 0')
  check(r.withMaintenanceStrategy === 1, 'overdue: withMaintenanceStrategy is 1')
}

// 4. Asset with nextDueAt === today → due soon (not overdue)
{
  const r = projectPlantEquipmentMaintenanceSummary(state([asset({ nextDueAt: '2026-08-11' })]), ASOF)
  check(r.overdueCount === 0, 'today: not overdue')
  check(r.dueSoonCount === 1, 'today: today is due soon')
}

// 5. Asset with nextDueAt = asOf + 7 days → due soon boundary (inclusive)
{
  // asOf=2026-08-11, +7 days = 2026-08-18
  const r = projectPlantEquipmentMaintenanceSummary(state([asset({ nextDueAt: '2026-08-18' })]), ASOF)
  check(r.dueSoonCount === 1, 'dueSoon-boundary: +7 days is still due soon')
  check(r.onTrackCount === 0, 'dueSoon-boundary: not on track at exactly +7')
}

// 6. Asset with nextDueAt = asOf + 8 days → on track
{
  const r = projectPlantEquipmentMaintenanceSummary(state([asset({ nextDueAt: '2026-08-19' })]), ASOF)
  check(r.dueSoonCount === 0, 'onTrack: +8 days is on track, not due soon')
  check(r.onTrackCount === 1, 'onTrack: onTrackCount is 1')
}

// 7. criticalOverdueCount: only overdue + critical
{
  const assets = [
    asset({ nextDueAt: '2026-08-10', criticality: 'critical' }),
    asset({ nextDueAt: '2026-08-10', criticality: 'high' }),
    asset({ nextDueAt: '2026-08-19', criticality: 'critical' }),
  ]
  const r = projectPlantEquipmentMaintenanceSummary(state(assets), ASOF)
  check(r.overdueCount === 2, 'critical: overdueCount is 2')
  check(r.criticalOverdueCount === 1, 'critical: only 1 is both overdue and critical')
}

// 8. Not commissioned → still counted in totalAssets but commissionedAssets excludes it
{
  const r = projectPlantEquipmentMaintenanceSummary(
    state([asset({ commissioningStatus: 'not_commissioned', nextDueAt: '2026-08-10' })]),
    ASOF,
  )
  check(r.totalAssets === 1, 'not-commissioned: in totalAssets')
  check(r.commissionedAssets === 0, 'not-commissioned: not in commissionedAssets')
  check(r.overdueCount === 1, 'not-commissioned: still counts for overdue')
}

// 9. byWorkCentre: groups assets per work centre
{
  const assets = [
    asset({ workCentreId: 'WC-A', nextDueAt: '2026-08-10' }),
    asset({ workCentreId: 'WC-A', nextDueAt: '2026-08-10' }),
    asset({ workCentreId: 'WC-B', nextDueAt: '2026-08-19' }),
    asset({ workCentreId: 'WC-B' }),
  ]
  const r = projectPlantEquipmentMaintenanceSummary(state(assets), ASOF)
  const wca = r.byWorkCentre.find(w => w.workCentreId === 'WC-A')
  const wcb = r.byWorkCentre.find(w => w.workCentreId === 'WC-B')
  check(wca.totalAssets === 2, 'byWC: WC-A has 2 assets')
  check(wca.overdueCount === 2, 'byWC: WC-A has 2 overdue')
  check(wcb.totalAssets === 2, 'byWC: WC-B has 2 assets')
  check(wcb.overdueCount === 0, 'byWC: WC-B has 0 overdue')
}

// 10. byWorkCentre sorted descending by overdueCount, then alphabetically
{
  const assets = [
    asset({ workCentreId: 'WC-Z', nextDueAt: '2026-08-10' }),
    asset({ workCentreId: 'WC-A', nextDueAt: '2026-08-10' }),
    asset({ workCentreId: 'WC-A', nextDueAt: '2026-08-10' }),
  ]
  const r = projectPlantEquipmentMaintenanceSummary(state(assets), ASOF)
  check(r.byWorkCentre[0].workCentreId === 'WC-A', 'byWC-sort: WC-A (2 overdue) is first')
  check(r.byWorkCentre[1].workCentreId === 'WC-Z', 'byWC-sort: WC-Z (1 overdue) is second')
}

// 11. Mix of all three states in one call
{
  const assets = [
    asset({ nextDueAt: '2026-08-05' }),  // overdue
    asset({ nextDueAt: '2026-08-15' }),  // due soon (4 days from now)
    asset({ nextDueAt: '2026-09-01' }),  // on track
    asset(),                              // no strategy
  ]
  const r = projectPlantEquipmentMaintenanceSummary(state(assets), ASOF)
  check(r.totalAssets === 4, 'mix: totalAssets is 4')
  check(r.withMaintenanceStrategy === 3, 'mix: 3 have strategy')
  check(r.overdueCount === 1, 'mix: overdueCount is 1')
  check(r.dueSoonCount === 1, 'mix: dueSoonCount is 1')
  check(r.onTrackCount === 1, 'mix: onTrackCount is 1')
}

console.log(JSON.stringify({ ok: true, checks }))
