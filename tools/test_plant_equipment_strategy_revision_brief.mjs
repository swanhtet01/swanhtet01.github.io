// Plant equipment strategy revision brief: maintenanceStrategy.revision numeric stats + savedBy actor distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentStrategyRevisionBrief } from './plant-equipment-strategy-revision-brief.ts'`,
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

const { projectPlantEquipmentStrategyRevisionBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'
const DIGEST = 'sha256:' + 'a'.repeat(64)

function strategy(revision, savedBy) {
  return {
    revision,
    actionId: 'ACT-1',
    savedAt: '2026-07-01T09:00:00Z',
    savedBy,
    maintenanceOwner: 'tech-1',
    intervalDays: 90,
    nextDueAt: '2026-10-01',
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

// 1. No equipment master → all zeros / null
{
  const r = projectPlantEquipmentStrategyRevisionBrief(state(undefined))
  check(r.totalStrategies === 0, 'empty: totalStrategies 0')
  check(r.totalRevisions === 0, 'empty: totalRevisions 0')
  check(r.averageRevision === 0, 'empty: averageRevision 0')
  check(r.maxRevision === null, 'empty: maxRevision null')
  check(r.uniqueSavedByActors === 0, 'empty: uniqueSavedByActors 0')
  check(r.topSavedByActorsByCount.length === 0, 'empty: topSavedByActorsByCount empty')
}

// 2. Assets with no strategies → all zeros
{
  const r = projectPlantEquipmentStrategyRevisionBrief(state([asset(undefined), asset(undefined)]))
  check(r.totalStrategies === 0, 'no-strategy: totalStrategies 0')
}

// 3. Single strategy → all fields populated
{
  const r = projectPlantEquipmentStrategyRevisionBrief(state([asset(strategy(3, 'engineer-1'))]))
  check(r.totalStrategies === 1, 'single: totalStrategies 1')
  check(r.totalRevisions === 3, 'single: totalRevisions 3')
  check(r.averageRevision === 3, 'single: averageRevision 3')
  check(r.maxRevision === 3, 'single: maxRevision 3')
  check(r.uniqueSavedByActors === 1, 'single: uniqueSavedByActors 1')
  check(r.topSavedByActorsByCount[0]?.actor === 'engineer-1', 'single: top actor engineer-1')
}

// 4. Revision math across multiple strategies
{
  const r = projectPlantEquipmentStrategyRevisionBrief(
    state([
      asset(strategy(1, 'engineer-1')),
      asset(strategy(5, 'engineer-1')),
      asset(strategy(3, 'engineer-2')),
    ]),
  )
  check(r.totalStrategies === 3, 'multi: totalStrategies 3')
  check(r.totalRevisions === 9, 'multi: totalRevisions 9')
  check(r.averageRevision === 3, 'multi: averageRevision 3')
  check(r.maxRevision === 5, 'multi: maxRevision 5')
}

// 5. savedBy actor distribution
{
  const r = projectPlantEquipmentStrategyRevisionBrief(
    state([
      asset(strategy(1, 'engineer-1')),
      asset(strategy(1, 'engineer-1')),
      asset(strategy(1, 'engineer-2')),
    ]),
  )
  check(r.uniqueSavedByActors === 2, 'actor-dist: uniqueSavedByActors 2')
  check(r.topSavedByActorsByCount[0]?.actor === 'engineer-1', 'actor-dist: top engineer-1')
  check(r.topSavedByActorsByCount[0]?.count === 2, 'actor-dist: top count 2')
}

// 6. Top-5 cap + tiebreak
{
  const actors = ['Z-eng', 'A-eng', 'C-eng', 'B-eng', 'D-eng', 'E-eng']
  const r = projectPlantEquipmentStrategyRevisionBrief(
    state(actors.map(a => asset(strategy(1, a)))),
  )
  check(r.topSavedByActorsByCount.length === 5, 'top5: capped at 5')
  check(r.topSavedByActorsByCount[0]?.actor === 'A-eng', 'top5: tiebreak A-eng first')
}

console.log(JSON.stringify({ ok: true, checks }))
