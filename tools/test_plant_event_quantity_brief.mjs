// Plant event quantity brief: quantity and remainingQuantity numeric stats across events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventQuantityBrief } from './plant-event-quantity-brief.ts'`,
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

const { projectPlantEventQuantityBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evtId = 0
function event({ quantity, remainingQuantity } = {}) {
  evtId++
  const e = {
    id: `EVT-${evtId}`,
    occurredAt: '2026-08-01T10:00:00Z',
    kind: 'material_consumed',
    actor: 'shift-1',
    subjectId: 'JOB-1',
    summary: `Event ${evtId}`,
  }
  if (quantity !== undefined) e.quantity = quantity
  if (remainingQuantity !== undefined) e.remainingQuantity = remainingQuantity
  return e
}

function state(events) {
  return { schema: 'supermega.production.workspace.v2', jobs: [], events, issues: [], machines: [] }
}

// 1. No events → all zeros
{
  const r = projectPlantEventQuantityBrief(state([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.eventsWithQuantity === 0, 'empty: eventsWithQuantity 0')
  check(r.totalQuantity === 0, 'empty: totalQuantity 0')
  check(r.averageQuantity === 0, 'empty: averageQuantity 0')
  check(r.eventsWithRemainingQuantity === 0, 'empty: eventsWithRemainingQuantity 0')
  check(r.totalRemainingQuantity === 0, 'empty: totalRemainingQuantity 0')
  check(r.averageRemainingQuantity === 0, 'empty: averageRemainingQuantity 0')
}

// 2. Events without quantity fields → not counted
{
  const r = projectPlantEventQuantityBrief(state([event(), event()]))
  check(r.totalEvents === 2, 'no-qty: totalEvents 2')
  check(r.eventsWithQuantity === 0, 'no-qty: eventsWithQuantity 0')
  check(r.eventsWithRemainingQuantity === 0, 'no-qty: eventsWithRemainingQuantity 0')
}

// 3. Single event with quantity
{
  const r = projectPlantEventQuantityBrief(state([event({ quantity: 50 })]))
  check(r.eventsWithQuantity === 1, 'qty-only: eventsWithQuantity 1')
  check(r.totalQuantity === 50, 'qty-only: totalQuantity 50')
  check(r.averageQuantity === 50, 'qty-only: averageQuantity 50')
  check(r.eventsWithRemainingQuantity === 0, 'qty-only: eventsWithRemainingQuantity 0')
}

// 4. Single event with remainingQuantity
{
  const r = projectPlantEventQuantityBrief(state([event({ remainingQuantity: 30 })]))
  check(r.eventsWithRemainingQuantity === 1, 'rem-only: eventsWithRemainingQuantity 1')
  check(r.totalRemainingQuantity === 30, 'rem-only: totalRemainingQuantity 30')
  check(r.averageRemainingQuantity === 30, 'rem-only: averageRemainingQuantity 30')
}

// 5. Multiple events, mixed presence
{
  const events = [
    event({ quantity: 100, remainingQuantity: 20 }),
    event(),
    event({ quantity: 200 }),
    event({ remainingQuantity: 40 }),
  ]
  const r = projectPlantEventQuantityBrief(state(events))
  check(r.totalEvents === 4, 'mixed: totalEvents 4')
  check(r.eventsWithQuantity === 2, 'mixed: eventsWithQuantity 2')
  check(r.totalQuantity === 300, 'mixed: totalQuantity 300')
  check(r.averageQuantity === 150, 'mixed: averageQuantity 150')
  check(r.eventsWithRemainingQuantity === 2, 'mixed: eventsWithRemainingQuantity 2')
  check(r.totalRemainingQuantity === 60, 'mixed: totalRemainingQuantity 60')
  check(r.averageRemainingQuantity === 30, 'mixed: averageRemainingQuantity 30')
}

// 6. Math.round: 100+201 = 301 / 2 = 150.5 → 151
{
  const r = projectPlantEventQuantityBrief(state([event({ quantity: 100 }), event({ quantity: 201 })]))
  check(r.averageQuantity === 151, 'round: averageQuantity round(150.5)=151')
}

console.log(JSON.stringify({ ok: true, checks }))
