// Plant event material lot brief: materialLot distribution on material_consumed events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventMaterialLotBrief } from './plant-event-material-lot-brief.ts'`,
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

const { projectPlantEventMaterialLotBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function materialEvent(materialLot) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: `ACT-${eventId}`,
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'worker-1',
    kind: 'material_consumed',
    quantity: 10,
    shiftRef: 'S1',
    materialRef: 'MAT-001',
    materialUnit: 'kg',
  }
  if (materialLot !== undefined) obj.materialLot = materialLot
  return obj
}
function otherEvent() {
  eventId++
  return { id: `EVT-${eventId}`, actionId: `ACT-O-${eventId}`, createdAt: '2026-08-01T08:00:00Z', actor: 'worker-1', kind: 'output_recorded', quantity: 5, shiftRef: 'S1', outputKind: 'good' }
}

function state(events) {
  return { schema: 'supermega.production.workspace.v2', revision: 0, jobs: [], issues: [], machines: [], events, openingPlan: null, orderExecution: null, orderPortfolio: null, equipmentMaster: null }
}

// 1. No events → all zeros
{
  const r = projectPlantEventMaterialLotBrief(state([]))
  check(r.totalMaterialEvents === 0, 'empty: totalMaterialEvents 0')
  check(r.eventsWithLot === 0, 'empty: eventsWithLot 0')
  check(r.lotPresenceRate === 0, 'empty: lotPresenceRate 0')
  check(r.uniqueLots === 0, 'empty: uniqueLots 0')
  check(r.topLotsByCount.length === 0, 'empty: top empty')
}

// 2. Other events not counted
{
  const r = projectPlantEventMaterialLotBrief(state([otherEvent(), otherEvent()]))
  check(r.totalMaterialEvents === 0, 'other: totalMaterialEvents 0')
}

// 3. Material events without lot → eventsWithLot 0, rate 0
{
  const r = projectPlantEventMaterialLotBrief(state([materialEvent(), materialEvent()]))
  check(r.totalMaterialEvents === 2, 'no-lot: totalMaterialEvents 2')
  check(r.eventsWithLot === 0, 'no-lot: eventsWithLot 0')
  check(r.lotPresenceRate === 0, 'no-lot: lotPresenceRate 0')
}

// 4. Single event with lot
{
  const r = projectPlantEventMaterialLotBrief(state([materialEvent('LOT-001')]))
  check(r.totalMaterialEvents === 1, 'single: totalMaterialEvents 1')
  check(r.eventsWithLot === 1, 'single: eventsWithLot 1')
  check(r.lotPresenceRate === 100, 'single: lotPresenceRate 100')
  check(r.uniqueLots === 1, 'single: uniqueLots 1')
  check(r.topLotsByCount[0]?.lot === 'LOT-001', 'single: top lot')
}

// 5. Mixed — some with lot, some without
{
  const r = projectPlantEventMaterialLotBrief(
    state([materialEvent('LOT-001'), materialEvent(), materialEvent('LOT-001'), materialEvent()]),
  )
  check(r.totalMaterialEvents === 4, 'mixed: totalMaterialEvents 4')
  check(r.eventsWithLot === 2, 'mixed: eventsWithLot 2')
  check(r.lotPresenceRate === 50, 'mixed: lotPresenceRate 50')
}

// 6. Lot distribution
{
  const r = projectPlantEventMaterialLotBrief(
    state([
      materialEvent('LOT-001'),
      materialEvent('LOT-001'),
      materialEvent('LOT-002'),
    ]),
  )
  check(r.uniqueLots === 2, 'lot-dist: uniqueLots 2')
  check(r.topLotsByCount[0]?.lot === 'LOT-001', 'lot-dist: top lot LOT-001')
  check(r.topLotsByCount[0]?.count === 2, 'lot-dist: count 2')
}

// 7. Top-5 cap + tiebreak
{
  const lots = ['Z-LOT', 'A-LOT', 'C-LOT', 'B-LOT', 'D-LOT', 'E-LOT']
  const r = projectPlantEventMaterialLotBrief(
    state(lots.map(lot => materialEvent(lot))),
  )
  check(r.topLotsByCount.length === 5, 'top5: capped at 5')
  check(r.topLotsByCount[0]?.lot === 'A-LOT', 'top5: tiebreak A-LOT first')
}

console.log(JSON.stringify({ ok: true, checks }))
