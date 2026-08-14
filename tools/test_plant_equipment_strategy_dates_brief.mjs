// Plant equipment strategy dates brief: maintenanceStrategy.savedAt + nextDueAt date ranges.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentStrategyDatesBrief } from './plant-equipment-strategy-dates-brief.ts'`,
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

const { projectPlantEquipmentStrategyDatesBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'
const DIGEST = 'sha256:' + 'a'.repeat(64)

function strategy(savedAt, nextDueAt) {
  return {
    revision: 1,
    actionId: 'ACT-1',
    savedAt,
    savedBy: 'engineer-1',
    maintenanceOwner: 'tech-1',
    intervalDays: 90,
    nextDueAt,
    procedureReference: 'PROC-1',
    safetyBaselineReference: 'SAFE-1',
  }
}

let assetId = 0
function asset(maintenanceStrategy) {
  assetId++
  const obj = {
    id: `ASSET-${assetId}`,
    name: `Asset ${assetId}`,
    workCentreId: 'WC-1',
    criticality: 'medium',
    owner: 'tech-1',
    commissioningStatus: 'commissioned',
    sourceActionId: 'ACT-1',
    sourcePackageDigest: DIGEST,
    importedAt: '2026-08-01T09:00:00Z',
  }
  if (maintenanceStrategy !== undefined) obj.maintenanceStrategy = maintenanceStrategy
  return obj
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

// 1. No equipment master → all zeros / nulls
{
  const r = projectPlantEquipmentStrategyDatesBrief(state(undefined))
  check(r.totalStrategies === 0, 'empty: totalStrategies 0')
  check(r.earliestSavedAt === null, 'empty: earliestSavedAt null')
  check(r.latestSavedAt === null, 'empty: latestSavedAt null')
  check(r.earliestNextDueAt === null, 'empty: earliestNextDueAt null')
  check(r.latestNextDueAt === null, 'empty: latestNextDueAt null')
}

// 2. Assets with no maintenance strategy → all zeros
{
  const r = projectPlantEquipmentStrategyDatesBrief(state([asset(undefined), asset(undefined)]))
  check(r.totalStrategies === 0, 'no-strategy: totalStrategies 0')
}

// 3. Single strategy → all fields populated
{
  const r = projectPlantEquipmentStrategyDatesBrief(
    state([asset(strategy('2026-07-01T09:00:00Z', '2026-10-01'))]),
  )
  check(r.totalStrategies === 1, 'single: totalStrategies 1')
  check(r.earliestSavedAt === '2026-07-01T09:00:00Z', 'single: earliestSavedAt')
  check(r.latestSavedAt === '2026-07-01T09:00:00Z', 'single: latestSavedAt')
  check(r.earliestNextDueAt === '2026-10-01', 'single: earliestNextDueAt')
  check(r.latestNextDueAt === '2026-10-01', 'single: latestNextDueAt')
}

// 4. savedAt ordering
{
  const r = projectPlantEquipmentStrategyDatesBrief(
    state([
      asset(strategy('2026-07-10T09:00:00Z', '2026-10-01')),
      asset(strategy('2026-07-01T09:00:00Z', '2026-10-01')),
      asset(strategy('2026-07-05T09:00:00Z', '2026-10-01')),
    ]),
  )
  check(r.earliestSavedAt === '2026-07-01T09:00:00Z', 'savedAt: earliest')
  check(r.latestSavedAt === '2026-07-10T09:00:00Z', 'savedAt: latest')
}

// 5. nextDueAt ordering
{
  const r = projectPlantEquipmentStrategyDatesBrief(
    state([
      asset(strategy('2026-07-01T09:00:00Z', '2026-12-01')),
      asset(strategy('2026-07-01T09:00:00Z', '2026-09-01')),
      asset(strategy('2026-07-01T09:00:00Z', '2026-10-15')),
    ]),
  )
  check(r.earliestNextDueAt === '2026-09-01', 'nextDueAt: earliest')
  check(r.latestNextDueAt === '2026-12-01', 'nextDueAt: latest')
}

// 6. Mixed assets with and without strategies
{
  const r = projectPlantEquipmentStrategyDatesBrief(
    state([
      asset(undefined),
      asset(strategy('2026-07-01T09:00:00Z', '2026-10-01')),
      asset(undefined),
    ]),
  )
  check(r.totalStrategies === 1, 'mixed: totalStrategies 1')
  check(r.earliestSavedAt === '2026-07-01T09:00:00Z', 'mixed: earliestSavedAt')
}

console.log(JSON.stringify({ ok: true, checks }))
