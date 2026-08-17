// Plant material consumption summary: aggregates material_consumed events by materialRef
// into totalQuantity, eventCount, shiftCount. Tests grouping, sort, date filter, edge cases.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMaterialConsumptionSummary } from './plant-material-consumption-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/material-consumption-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantMaterialConsumptionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let seq = 0
function materialEvent({ materialRef, quantity, materialUnit = 'kg', shiftRef = 'S1', date = '2026-08-11' } = {}) {
  seq += 1
  return {
    id: `ev-${seq}`,
    actionId: `a-${seq}`,
    createdAt: `${date}T08:00:00Z`,
    actor: 'op1',
    reason: 'consumed in production',
    evidenceReference: `e-${seq}`,
    kind: 'material_consumed',
    subjectId: `j-${seq}`,
    summary: 'material consumed',
    sourceRevision: seq,
    sourceDigest: 'digest',
    materialRef,
    quantity,
    materialUnit,
    shiftRef,
  }
}

function otherEvent(date = '2026-08-11') {
  seq += 1
  return { id: `ev-${seq}`, actionId: `a-${seq}`, createdAt: `${date}T08:00:00Z`, actor: 'op1', reason: '', evidenceReference: `e-${seq}`, kind: 'shift_closed', subjectId: 'S1', summary: '' }
}

function state(events = []) {
  return { jobs: [], events, issues: [] }
}

// 1. Empty state → all zeros
{
  const r = projectPlantMaterialConsumptionSummary(state())
  check(r.totalEventCount === 0, 'empty: totalEventCount is 0')
  check(r.distinctMaterials === 0, 'empty: distinctMaterials is 0')
  check(r.byMaterial.length === 0, 'empty: byMaterial is empty')
}

// 2. Non-material events excluded
{
  const r = projectPlantMaterialConsumptionSummary(state([otherEvent()]))
  check(r.totalEventCount === 0, 'non-material: excluded from count')
  check(r.distinctMaterials === 0, 'non-material: no materials found')
}

// 3. Single material consumption event
{
  const r = projectPlantMaterialConsumptionSummary(state([
    materialEvent({ materialRef: 'FLOUR-001', quantity: 100 }),
  ]))
  check(r.totalEventCount === 1, 'single: totalEventCount is 1')
  check(r.distinctMaterials === 1, 'single: distinctMaterials is 1')
  check(r.byMaterial[0].materialRef === 'FLOUR-001', 'single: materialRef is correct')
  check(r.byMaterial[0].totalQuantity === 100, 'single: totalQuantity is 100')
  check(r.byMaterial[0].eventCount === 1, 'single: eventCount is 1')
  check(r.byMaterial[0].shiftCount === 1, 'single: shiftCount is 1')
  check(r.byMaterial[0].materialUnit === 'kg', 'single: materialUnit is kg')
}

// 4. Multiple events for same material → quantities accumulate
{
  const r = projectPlantMaterialConsumptionSummary(state([
    materialEvent({ materialRef: 'SUGAR-002', quantity: 50, shiftRef: 'S1' }),
    materialEvent({ materialRef: 'SUGAR-002', quantity: 75, shiftRef: 'S1' }),
    materialEvent({ materialRef: 'SUGAR-002', quantity: 25, shiftRef: 'S2' }),
  ]))
  const sugar = r.byMaterial[0]
  check(sugar.totalQuantity === 150, 'accumulate: totalQuantity is 150')
  check(sugar.eventCount === 3, 'accumulate: eventCount is 3')
  check(sugar.shiftCount === 2, 'accumulate: 2 distinct shifts')
}

// 5. Multiple materials sorted by totalQuantity descending
{
  const events = [
    materialEvent({ materialRef: 'MAT-A', quantity: 50 }),
    materialEvent({ materialRef: 'MAT-B', quantity: 200 }),
    materialEvent({ materialRef: 'MAT-C', quantity: 100 }),
  ]
  const r = projectPlantMaterialConsumptionSummary(state(events))
  check(r.byMaterial[0].materialRef === 'MAT-B', 'sort: MAT-B (200) is first')
  check(r.byMaterial[1].materialRef === 'MAT-C', 'sort: MAT-C (100) is second')
  check(r.byMaterial[2].materialRef === 'MAT-A', 'sort: MAT-A (50) is last')
  check(r.distinctMaterials === 3, 'sort: 3 distinct materials')
}

// 6. Tie in quantity → sorted alphabetically by materialRef
{
  const events = [
    materialEvent({ materialRef: 'ZZZ', quantity: 100 }),
    materialEvent({ materialRef: 'AAA', quantity: 100 }),
  ]
  const r = projectPlantMaterialConsumptionSummary(state(events))
  check(r.byMaterial[0].materialRef === 'AAA', 'alpha-tie: AAA before ZZZ on equal quantity')
}

// 7. shiftCount counts distinct shifts per material
{
  const events = [
    materialEvent({ materialRef: 'RESIN-001', quantity: 10, shiftRef: 'S1' }),
    materialEvent({ materialRef: 'RESIN-001', quantity: 10, shiftRef: 'S2' }),
    materialEvent({ materialRef: 'RESIN-001', quantity: 10, shiftRef: 'S1' }),  // S1 again
    materialEvent({ materialRef: 'RESIN-001', quantity: 10, shiftRef: 'S3' }),
  ]
  const r = projectPlantMaterialConsumptionSummary(state(events))
  check(r.byMaterial[0].shiftCount === 3, 'shiftCount: 3 distinct shifts (S1 counted once)')
  check(r.byMaterial[0].eventCount === 4, 'shiftCount: 4 events total')
}

// 8. Date filter: only events matching prefix
{
  const events = [
    materialEvent({ materialRef: 'OIL-001', quantity: 50, date: '2026-08-10' }),
    materialEvent({ materialRef: 'OIL-001', quantity: 30, date: '2026-08-11' }),
  ]
  const r = projectPlantMaterialConsumptionSummary(state(events), '2026-08-11')
  check(r.totalEventCount === 1, 'date-filter: only Aug 11 event counted')
  check(r.byMaterial[0].totalQuantity === 30, 'date-filter: Aug 11 quantity is 30')
}

// 9. Mixed material_consumed and other events
{
  const events = [
    materialEvent({ materialRef: 'FIBER-001', quantity: 80 }),
    otherEvent(),
    materialEvent({ materialRef: 'FIBER-001', quantity: 40 }),
    otherEvent(),
  ]
  const r = projectPlantMaterialConsumptionSummary(state(events))
  check(r.totalEventCount === 2, 'mixed: only material_consumed events counted')
  check(r.byMaterial[0].totalQuantity === 120, 'mixed: quantities from 2 events summed')
}

console.log(JSON.stringify({ ok: true, checks }))
