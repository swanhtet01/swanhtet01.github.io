// Plant event material ref brief: materialRef text distribution + materialUnit enum distribution on material events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventMaterialRefBrief } from './plant-event-material-ref-brief.ts'`,
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

const { projectPlantEventMaterialRefBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0
function materialEvent(materialRef, materialUnit) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    reason: 'Material consumed.',
    evidenceReference: 'EVD-1',
    kind: 'material_consumed',
    subjectId: 'JOB-1',
    summary: 'Consumed material.',
    materialRef,
    materialUnit,
  }
  return obj
}

function nonMaterialEvent() {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    reason: 'Job started.',
    evidenceReference: 'EVD-1',
    kind: 'job_started',
    subjectId: 'JOB-1',
    summary: 'Job started.',
  }
}

function state(events) {
  return { schema: SCHEMA, jobs: [], issues: [], events, closes: [] }
}

// 1. No events → all zeros
{
  const r = projectPlantEventMaterialRefBrief(state([]))
  check(r.totalMaterialEvents === 0, 'empty: totalMaterialEvents 0')
  check(r.uniqueMaterialRefs === 0, 'empty: uniqueMaterialRefs 0')
  check(r.topMaterialRefsByCount.length === 0, 'empty: topMaterialRefsByCount empty')
  check(r.unitKg === 0, 'empty: unitKg 0')
  check(r.unitPcs === 0, 'empty: unitPcs 0')
}

// 2. Non-material events skipped
{
  const r = projectPlantEventMaterialRefBrief(state([nonMaterialEvent(), nonMaterialEvent()]))
  check(r.totalMaterialEvents === 0, 'non-material: totalMaterialEvents 0')
}

// 3. Single material event → all fields populated
{
  const r = projectPlantEventMaterialRefBrief(state([materialEvent('MAT-001', 'kg')]))
  check(r.totalMaterialEvents === 1, 'single: totalMaterialEvents 1')
  check(r.uniqueMaterialRefs === 1, 'single: uniqueMaterialRefs 1')
  check(r.topMaterialRefsByCount[0]?.ref === 'MAT-001', 'single: top ref MAT-001')
  check(r.unitKg === 1, 'single: unitKg 1')
  check(r.unitPcs === 0, 'single: unitPcs 0')
}

// 4. Multiple material refs → distribution
{
  const r = projectPlantEventMaterialRefBrief(
    state([
      materialEvent('MAT-001', 'kg'),
      materialEvent('MAT-001', 'kg'),
      materialEvent('MAT-002', 'pcs'),
    ]),
  )
  check(r.totalMaterialEvents === 3, 'multi-ref: totalMaterialEvents 3')
  check(r.uniqueMaterialRefs === 2, 'multi-ref: uniqueMaterialRefs 2')
  check(r.topMaterialRefsByCount[0]?.ref === 'MAT-001', 'multi-ref: top MAT-001')
  check(r.topMaterialRefsByCount[0]?.count === 2, 'multi-ref: count 2')
  check(r.unitKg === 2, 'multi-ref: unitKg 2')
  check(r.unitPcs === 1, 'multi-ref: unitPcs 1')
}

// 5. All 11 material unit types
{
  const units = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm']
  const r = projectPlantEventMaterialRefBrief(
    state(units.map(u => materialEvent('MAT-001', u))),
  )
  check(r.unitKg === 1, 'units: unitKg 1')
  check(r.unitG === 1, 'units: unitG 1')
  check(r.unitL === 1, 'units: unitL 1')
  check(r.unitMl === 1, 'units: unitMl 1')
  check(r.unitPcs === 1, 'units: unitPcs 1')
  check(r.unitPack === 1, 'units: unitPack 1')
  check(r.unitBag === 1, 'units: unitBag 1')
  check(r.unitRoll === 1, 'units: unitRoll 1')
  check(r.unitSheet === 1, 'units: unitSheet 1')
  check(r.unitM === 1, 'units: unitM 1')
  check(r.unitCm === 1, 'units: unitCm 1')
}

// 6. Top-5 cap + tiebreak
{
  const refs = ['Z-mat', 'A-mat', 'C-mat', 'B-mat', 'D-mat', 'E-mat']
  const r = projectPlantEventMaterialRefBrief(state(refs.map(ref => materialEvent(ref, 'kg'))))
  check(r.topMaterialRefsByCount.length === 5, 'top5: capped at 5')
  check(r.topMaterialRefsByCount[0]?.ref === 'A-mat', 'top5: tiebreak A-mat first')
}

console.log(JSON.stringify({ ok: true, checks }))
