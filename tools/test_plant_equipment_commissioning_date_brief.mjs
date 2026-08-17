// Plant equipment commissioning date brief: commissionedAt, commissionedBy, installedAt.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentCommissioningDateBrief } from './plant-equipment-commissioning-date-brief.ts'`,
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

const { projectPlantEquipmentCommissioningDateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let assetSeq = 0
function commissioning({
  commissionedAt = '2026-01-01T00:00:00Z',
  commissionedBy = 'Engineer A',
  installedAt = '2025-12-01T00:00:00Z',
} = {}) {
  return {
    actionId: `ACT-${++assetSeq}`,
    commissionedAt,
    commissionedBy,
    installedAt,
    initialState: 'idle',
    safetyBaselineReference: `SBR-${assetSeq}`,
  }
}

function asset({ name = 'Mixer', owner = 'Plant Ops', importedAt = '2026-01-01T00:00:00Z', commission } = {}) {
  assetSeq++
  const base = { id: `ASSET-${assetSeq}`, name, owner, importedAt }
  if (commission !== undefined) base.commissioning = commission
  return base
}

function state(assets = []) {
  return {
    schema: 'supermega.production.workspace.v2',
    issues: [],
    equipmentMaster: { assets },
  }
}

function stateNoMaster() {
  return { schema: 'supermega.production.workspace.v2', issues: [] }
}

// 1. No master → all nulls/zeros
{
  const r = projectPlantEquipmentCommissioningDateBrief(stateNoMaster())
  check(r.totalCommissioned === 0, 'no-master: totalCommissioned 0')
  check(r.earliestCommissionedAt === null, 'no-master: earliestCommissionedAt null')
  check(r.latestCommissionedAt === null, 'no-master: latestCommissionedAt null')
  check(r.earliestInstalledAt === null, 'no-master: earliestInstalledAt null')
  check(r.latestInstalledAt === null, 'no-master: latestInstalledAt null')
  check(r.uniqueCommissionedBy === 0, 'no-master: uniqueCommissionedBy 0')
  check(r.topCommissionedByCount.length === 0, 'no-master: topCommissionedByCount empty')
}

// 2. Empty assets → all nulls/zeros
{
  const r = projectPlantEquipmentCommissioningDateBrief(state([]))
  check(r.totalCommissioned === 0, 'empty: totalCommissioned 0')
  check(r.earliestCommissionedAt === null, 'empty: earliestCommissionedAt null')
}

// 3. Asset without commissioning → still zero
{
  const r = projectPlantEquipmentCommissioningDateBrief(state([asset()]))
  check(r.totalCommissioned === 0, 'no-commission: totalCommissioned 0')
  check(r.uniqueCommissionedBy === 0, 'no-commission: uniqueCommissionedBy 0')
}

// 4. Single commissioned asset
{
  const r = projectPlantEquipmentCommissioningDateBrief(state([
    asset({ commission: commissioning({ commissionedAt: '2026-03-01T00:00:00Z', commissionedBy: 'Alice', installedAt: '2026-02-01T00:00:00Z' }) }),
  ]))
  check(r.totalCommissioned === 1, 'single: totalCommissioned 1')
  check(r.earliestCommissionedAt === '2026-03-01T00:00:00Z', 'single: earliestCommissionedAt')
  check(r.latestCommissionedAt === '2026-03-01T00:00:00Z', 'single: latestCommissionedAt')
  check(r.earliestInstalledAt === '2026-02-01T00:00:00Z', 'single: earliestInstalledAt')
  check(r.latestInstalledAt === '2026-02-01T00:00:00Z', 'single: latestInstalledAt')
  check(r.uniqueCommissionedBy === 1, 'single: uniqueCommissionedBy 1')
  check(r.topCommissionedByCount[0].commissionedBy === 'Alice', 'single: top person Alice')
  check(r.topCommissionedByCount[0].count === 1, 'single: count 1')
}

// 5. Date range across multiple assets
{
  const r = projectPlantEquipmentCommissioningDateBrief(state([
    asset({ commission: commissioning({ commissionedAt: '2026-03-01T00:00:00Z', commissionedBy: 'Alice', installedAt: '2026-02-01T00:00:00Z' }) }),
    asset({ commission: commissioning({ commissionedAt: '2026-01-01T00:00:00Z', commissionedBy: 'Bob', installedAt: '2025-12-01T00:00:00Z' }) }),
    asset({ commission: commissioning({ commissionedAt: '2026-05-15T00:00:00Z', commissionedBy: 'Alice', installedAt: '2026-04-01T00:00:00Z' }) }),
    asset(),
  ]))
  check(r.totalCommissioned === 3, 'range: totalCommissioned 3')
  check(r.earliestCommissionedAt === '2026-01-01T00:00:00Z', 'range: earliest commissioned')
  check(r.latestCommissionedAt === '2026-05-15T00:00:00Z', 'range: latest commissioned')
  check(r.earliestInstalledAt === '2025-12-01T00:00:00Z', 'range: earliest installed')
  check(r.latestInstalledAt === '2026-04-01T00:00:00Z', 'range: latest installed')
  check(r.uniqueCommissionedBy === 2, 'range: uniqueCommissionedBy 2')
  check(r.topCommissionedByCount[0].commissionedBy === 'Alice', 'range: top Alice')
  check(r.topCommissionedByCount[0].count === 2, 'range: Alice count 2')
  check(r.topCommissionedByCount[1].commissionedBy === 'Bob', 'range: second Bob')
}

// 6. Top-5 cap
{
  const assets = ['A', 'B', 'C', 'D', 'E', 'F'].map(name =>
    asset({ commission: commissioning({ commissionedBy: name }) }),
  )
  const r = projectPlantEquipmentCommissioningDateBrief(state(assets))
  check(r.topCommissionedByCount.length === 5, 'top5-cap: length 5')
}

console.log(JSON.stringify({ ok: true, checks }))
