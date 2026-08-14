// Plant equipment commissioning state brief: initialState distribution on equipment commissioning.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEquipmentCommissioningStateBrief } from './plant-equipment-commissioning-state-brief.ts'`,
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

const { projectPlantEquipmentCommissioningStateBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let assetId = 0
function asset({ initialState, hasCommissioning = true } = {}) {
  assetId++
  return {
    id: `eq-${assetId}`,
    name: `Equipment ${assetId}`,
    workCentreId: 'wc-01',
    criticality: 'high',
    owner: 'plant-01',
    commissioningStatus: hasCommissioning ? 'commissioned' : 'not_commissioned',
    importedAt: '2026-08-01',
    sourceActionId: `sa-${assetId}`,
    sourcePackageDigest: `digest-${assetId}`,
    ...(hasCommissioning && {
      commissioning: {
        actionId: `comm-${assetId}`,
        commissionedAt: '2026-01-15T08:00:00Z',
        commissionedBy: 'eng-01',
        installedAt: '2026-01-14T10:00:00Z',
        initialState: initialState ?? 'running',
        safetyBaselineReference: 'SB-001',
      },
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

// 1. Empty → all zeros
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([]))
  check(r.totalCommissionings === 0, 'empty: totalCommissionings 0')
  check(r.runningCount === 0, 'empty: runningCount 0')
  check(r.attentionCount === 0, 'empty: attentionCount 0')
  check(r.stoppedCount === 0, 'empty: stoppedCount 0')
  check(r.runningRate === 0, 'empty: runningRate 0')
  check(r.attentionRate === 0, 'empty: attentionRate 0')
  check(r.stoppedRate === 0, 'empty: stoppedRate 0')
}

// 2. No equipmentMaster
{
  const r = projectPlantEquipmentCommissioningStateBrief(state(undefined))
  check(r.totalCommissionings === 0, 'no-master: totalCommissionings 0')
}

// 3. Asset without commissioning
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([asset({ hasCommissioning: false })]))
  check(r.totalCommissionings === 0, 'no-commissioning: total 0')
}

// 4. Single running commissioning
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([asset({ initialState: 'running' })]))
  check(r.totalCommissionings === 1, 'running: total 1')
  check(r.runningCount === 1, 'running: runningCount 1')
  check(r.attentionCount === 0, 'running: attentionCount 0')
  check(r.stoppedCount === 0, 'running: stoppedCount 0')
  check(r.runningRate === 100, 'running: runningRate 100')
  check(r.attentionRate === 0, 'running: attentionRate 0')
  check(r.stoppedRate === 0, 'running: stoppedRate 0')
}

// 5. Single attention commissioning
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([asset({ initialState: 'attention' })]))
  check(r.attentionCount === 1, 'attention: attentionCount 1')
  check(r.attentionRate === 100, 'attention: attentionRate 100')
}

// 6. Single stopped commissioning
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([asset({ initialState: 'stopped' })]))
  check(r.stoppedCount === 1, 'stopped: stoppedCount 1')
  check(r.stoppedRate === 100, 'stopped: stoppedRate 100')
}

// 7. Mixed states
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([
    asset({ initialState: 'running' }),
    asset({ initialState: 'running' }),
    asset({ initialState: 'attention' }),
    asset({ initialState: 'stopped' }),
  ]))
  check(r.totalCommissionings === 4, 'mixed: total 4')
  check(r.runningCount === 2, 'mixed: runningCount 2')
  check(r.attentionCount === 1, 'mixed: attentionCount 1')
  check(r.stoppedCount === 1, 'mixed: stoppedCount 1')
  check(r.runningRate === 50, 'mixed: runningRate 50')
  check(r.attentionRate === 25, 'mixed: attentionRate 25')
  check(r.stoppedRate === 25, 'mixed: stoppedRate 25')
}

// 8. Skip assets without commissioning
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([
    asset({ initialState: 'running' }),
    asset({ hasCommissioning: false }),
    asset({ initialState: 'stopped' }),
  ]))
  check(r.totalCommissionings === 2, 'skip-uncommissioned: total 2')
  check(r.runningCount === 1, 'skip-uncommissioned: runningCount 1')
  check(r.stoppedCount === 1, 'skip-uncommissioned: stoppedCount 1')
}

// 9. Rate rounding: 1/3 → 33
{
  const r = projectPlantEquipmentCommissioningStateBrief(state([
    asset({ initialState: 'running' }),
    asset({ initialState: 'attention' }),
    asset({ initialState: 'stopped' }),
  ]))
  check(r.totalCommissionings === 3, 'rounding: total 3')
  check(r.runningRate === 33, 'rounding: runningRate 33')
  check(r.attentionRate === 33, 'rounding: attentionRate 33')
  check(r.stoppedRate === 33, 'rounding: stoppedRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
