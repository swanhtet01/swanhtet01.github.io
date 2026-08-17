// Plant equipment asset identity brief: name uniqueness, owner top-5, importedAt date range.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentAssetIdentityBrief } from './plant-equipment-asset-identity-brief.ts'`,
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

const { projectPlantEquipmentAssetIdentityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let assetId = 0
function asset({ name = 'Pump A', owner = 'plant-mgr', importedAt = '2026-01-15T08:00:00Z' } = {}) {
  assetId++
  return {
    id: `eq-${assetId}`,
    name,
    workCentreId: 'wc-01',
    criticality: 'high',
    owner,
    commissioningStatus: 'commissioned',
    importedAt,
    sourceActionId: `sa-${assetId}`,
    sourcePackageDigest: `digest-${assetId}`,
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

// 1. No equipmentMaster → all zeros / nulls
{
  const r = projectPlantEquipmentAssetIdentityBrief(state(undefined))
  check(r.totalAssets === 0, 'no-master: totalAssets 0')
  check(r.uniqueNames === 0, 'no-master: uniqueNames 0')
  check(r.uniqueOwners === 0, 'no-master: uniqueOwners 0')
  check(r.topOwnersByCount.length === 0, 'no-master: topOwners empty')
  check(r.earliestImportedAt === null, 'no-master: earliest null')
  check(r.latestImportedAt === null, 'no-master: latest null')
}

// 2. Empty assets array
{
  const r = projectPlantEquipmentAssetIdentityBrief(state([]))
  check(r.totalAssets === 0, 'empty: totalAssets 0')
}

// 3. Single asset
{
  const r = projectPlantEquipmentAssetIdentityBrief(state([
    asset({ name: 'Boiler-1', owner: 'eng-team', importedAt: '2026-06-01T00:00:00Z' }),
  ]))
  check(r.totalAssets === 1, 'single: totalAssets 1')
  check(r.uniqueNames === 1, 'single: uniqueNames 1')
  check(r.uniqueOwners === 1, 'single: uniqueOwners 1')
  check(r.topOwnersByCount[0].owner === 'eng-team', 'single: top owner name')
  check(r.topOwnersByCount[0].count === 1, 'single: top owner count 1')
  check(r.earliestImportedAt === '2026-06-01T00:00:00Z', 'single: earliest')
  check(r.latestImportedAt === '2026-06-01T00:00:00Z', 'single: latest')
}

// 4. Multiple assets: importedAt date range
{
  const r = projectPlantEquipmentAssetIdentityBrief(state([
    asset({ importedAt: '2026-03-01T00:00:00Z' }),
    asset({ importedAt: '2026-07-15T00:00:00Z' }),
    asset({ importedAt: '2026-05-10T00:00:00Z' }),
  ]))
  check(r.totalAssets === 3, 'date-range: totalAssets 3')
  check(r.earliestImportedAt === '2026-03-01T00:00:00Z', 'date-range: earliest')
  check(r.latestImportedAt === '2026-07-15T00:00:00Z', 'date-range: latest')
}

// 5. Same name shared by two assets → uniqueNames = 1
{
  const r = projectPlantEquipmentAssetIdentityBrief(state([
    asset({ name: 'Conveyor' }),
    asset({ name: 'Conveyor' }),
    asset({ name: 'Boiler' }),
  ]))
  check(r.totalAssets === 3, 'names: totalAssets 3')
  check(r.uniqueNames === 2, 'names: uniqueNames 2')
}

// 6. Owner top-5 ordering: owner-A×3 beats owner-B×2
{
  const r = projectPlantEquipmentAssetIdentityBrief(state([
    asset({ owner: 'owner-B' }),
    asset({ owner: 'owner-A' }),
    asset({ owner: 'owner-A' }),
    asset({ owner: 'owner-B' }),
    asset({ owner: 'owner-A' }),
  ]))
  check(r.uniqueOwners === 2, 'owners: uniqueOwners 2')
  check(r.topOwnersByCount[0].owner === 'owner-A', 'owners: top is owner-A')
  check(r.topOwnersByCount[0].count === 3, 'owners: owner-A count 3')
  check(r.topOwnersByCount[1].owner === 'owner-B', 'owners: second is owner-B')
}

// 7. Tie-break: same owner count → lexicographic
{
  const r = projectPlantEquipmentAssetIdentityBrief(state([
    asset({ owner: 'zeta-team' }),
    asset({ owner: 'alpha-team' }),
  ]))
  check(r.topOwnersByCount[0].owner === 'alpha-team', 'tiebreak: alpha before zeta')
}

console.log(JSON.stringify({ ok: true, checks }))
