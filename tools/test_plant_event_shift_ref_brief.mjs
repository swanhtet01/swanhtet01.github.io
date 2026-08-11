// Plant event shift ref brief: shiftRef text distribution across events that carry a shift reference.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventShiftRefBrief } from './plant-event-shift-ref-brief.ts'`,
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

const { projectPlantEventShiftRefBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.production.workspace.v2'

let eventId = 0
function shiftEvent(shiftRef) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-01T09:00:00Z',
    actor: 'operator-1',
    reason: 'Output recorded.',
    evidenceReference: 'EVD-1',
    kind: 'output_recorded',
    subjectId: 'JOB-1',
    summary: 'Recorded output.',
    quantity: 10,
    shiftRef,
  }
  return obj
}

function noShiftEvent() {
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
  const r = projectPlantEventShiftRefBrief(state([]))
  check(r.totalEventsWithShiftRef === 0, 'empty: totalEventsWithShiftRef 0')
  check(r.uniqueShiftRefs === 0, 'empty: uniqueShiftRefs 0')
  check(r.topShiftRefsByCount.length === 0, 'empty: topShiftRefsByCount empty')
}

// 2. Events without shiftRef skipped
{
  const r = projectPlantEventShiftRefBrief(state([noShiftEvent(), noShiftEvent()]))
  check(r.totalEventsWithShiftRef === 0, 'no-shift: totalEventsWithShiftRef 0')
}

// 3. Single shift event → all fields populated
{
  const r = projectPlantEventShiftRefBrief(state([shiftEvent('SHIFT-2026-08-01-A')]))
  check(r.totalEventsWithShiftRef === 1, 'single: totalEventsWithShiftRef 1')
  check(r.uniqueShiftRefs === 1, 'single: uniqueShiftRefs 1')
  check(r.topShiftRefsByCount[0]?.shiftRef === 'SHIFT-2026-08-01-A', 'single: top shiftRef')
  check(r.topShiftRefsByCount[0]?.count === 1, 'single: count 1')
}

// 4. Multiple events across shifts → distribution
{
  const r = projectPlantEventShiftRefBrief(
    state([
      shiftEvent('SHIFT-A'), shiftEvent('SHIFT-A'), shiftEvent('SHIFT-A'),
      shiftEvent('SHIFT-B'), shiftEvent('SHIFT-B'),
      shiftEvent('SHIFT-C'),
    ]),
  )
  check(r.totalEventsWithShiftRef === 6, 'multi: totalEventsWithShiftRef 6')
  check(r.uniqueShiftRefs === 3, 'multi: uniqueShiftRefs 3')
  check(r.topShiftRefsByCount[0]?.shiftRef === 'SHIFT-A', 'multi: top SHIFT-A')
  check(r.topShiftRefsByCount[0]?.count === 3, 'multi: count 3')
  check(r.topShiftRefsByCount[1]?.shiftRef === 'SHIFT-B', 'multi: second SHIFT-B')
}

// 5. Top-5 cap + tiebreak
{
  const refs = ['Z-shift', 'A-shift', 'C-shift', 'B-shift', 'D-shift', 'E-shift']
  const r = projectPlantEventShiftRefBrief(state(refs.map(r => shiftEvent(r))))
  check(r.topShiftRefsByCount.length === 5, 'top5: capped at 5')
  check(r.topShiftRefsByCount[0]?.shiftRef === 'A-shift', 'top5: tiebreak A-shift first')
}

// 6. Mixed shift + no-shift events
{
  const r = projectPlantEventShiftRefBrief(
    state([noShiftEvent(), shiftEvent('SHIFT-A'), noShiftEvent(), shiftEvent('SHIFT-A')]),
  )
  check(r.totalEventsWithShiftRef === 2, 'mixed: totalEventsWithShiftRef 2')
  check(r.uniqueShiftRefs === 1, 'mixed: uniqueShiftRefs 1')
}

console.log(JSON.stringify({ ok: true, checks }))
