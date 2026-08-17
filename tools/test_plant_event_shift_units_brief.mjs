// Plant event shift units brief: goodUnits and scrapUnits numeric stats across events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventShiftUnitsBrief } from './plant-event-shift-units-brief.ts'`,
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

const { projectPlantEventShiftUnitsBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let evtId = 0
function event({ goodUnits, scrapUnits } = {}) {
  evtId++
  const e = {
    id: `EVT-${evtId}`,
    occurredAt: '2026-08-01T10:00:00Z',
    kind: 'shift_closed',
    actor: 'shift-1',
    summary: `Event ${evtId}`,
  }
  if (goodUnits !== undefined) e.goodUnits = goodUnits
  if (scrapUnits !== undefined) e.scrapUnits = scrapUnits
  return e
}

function state(events) {
  return { schema: 'supermega.production.workspace.v2', jobs: [], events, issues: [], machines: [] }
}

// 1. No events → all zeros
{
  const r = projectPlantEventShiftUnitsBrief(state([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.eventsWithGoodUnits === 0, 'empty: eventsWithGoodUnits 0')
  check(r.totalGoodUnits === 0, 'empty: totalGoodUnits 0')
  check(r.averageGoodUnits === 0, 'empty: averageGoodUnits 0')
  check(r.eventsWithScrapUnits === 0, 'empty: eventsWithScrapUnits 0')
  check(r.totalScrapUnits === 0, 'empty: totalScrapUnits 0')
  check(r.averageScrapUnits === 0, 'empty: averageScrapUnits 0')
}

// 2. Events without goodUnits/scrapUnits → not counted
{
  const r = projectPlantEventShiftUnitsBrief(state([event(), event()]))
  check(r.totalEvents === 2, 'no-units: totalEvents 2')
  check(r.eventsWithGoodUnits === 0, 'no-units: eventsWithGoodUnits 0')
  check(r.eventsWithScrapUnits === 0, 'no-units: eventsWithScrapUnits 0')
}

// 3. Single event with goodUnits
{
  const r = projectPlantEventShiftUnitsBrief(state([event({ goodUnits: 150 })]))
  check(r.totalEvents === 1, 'good-only: totalEvents 1')
  check(r.eventsWithGoodUnits === 1, 'good-only: eventsWithGoodUnits 1')
  check(r.totalGoodUnits === 150, 'good-only: totalGoodUnits 150')
  check(r.averageGoodUnits === 150, 'good-only: averageGoodUnits 150')
  check(r.eventsWithScrapUnits === 0, 'good-only: eventsWithScrapUnits 0')
  check(r.averageScrapUnits === 0, 'good-only: averageScrapUnits 0')
}

// 4. Single event with both goodUnits and scrapUnits
{
  const r = projectPlantEventShiftUnitsBrief(state([event({ goodUnits: 200, scrapUnits: 10 })]))
  check(r.totalGoodUnits === 200, 'both: totalGoodUnits 200')
  check(r.totalScrapUnits === 10, 'both: totalScrapUnits 10')
  check(r.averageScrapUnits === 10, 'both: averageScrapUnits 10')
}

// 5. Multiple events, mixed presence
{
  const events = [
    event({ goodUnits: 100, scrapUnits: 5 }),
    event(),
    event({ goodUnits: 200, scrapUnits: 15 }),
  ]
  const r = projectPlantEventShiftUnitsBrief(state(events))
  check(r.totalEvents === 3, 'mixed: totalEvents 3')
  check(r.eventsWithGoodUnits === 2, 'mixed: eventsWithGoodUnits 2')
  check(r.totalGoodUnits === 300, 'mixed: totalGoodUnits 300')
  check(r.averageGoodUnits === 150, 'mixed: averageGoodUnits 150')
  check(r.eventsWithScrapUnits === 2, 'mixed: eventsWithScrapUnits 2')
  check(r.totalScrapUnits === 20, 'mixed: totalScrapUnits 20')
  check(r.averageScrapUnits === 10, 'mixed: averageScrapUnits 10')
}

// 6. Math.round: good units 100+201 = 301 / 2 = 150.5 → 151
{
  const r = projectPlantEventShiftUnitsBrief(state([event({ goodUnits: 100 }), event({ goodUnits: 201 })]))
  check(r.averageGoodUnits === 151, 'round: averageGoodUnits round(150.5)=151')
}

console.log(JSON.stringify({ ok: true, checks }))
