// Plant event reason brief: ProductionEvent.reason text distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventReasonBrief } from './plant-event-reason-brief.ts'`,
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

const { projectPlantEventReasonBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventSeq = 0
function event({ reason = 'Routine operation', kind = 'output_recorded' } = {}) {
  eventSeq++
  return {
    id: `EVT-${eventSeq}`,
    actionId: `ACT-${eventSeq}`,
    createdAt: '2026-08-12T09:00:00Z',
    actor: 'operator-1',
    reason,
    summary: 'Event occurred.',
    kind,
    subjectId: 'JOB-1',
  }
}

function state(events = []) {
  return { schema: 'supermega.production.workspace.v2', issues: [], machines: [], jobs: [], events }
}

// 1. Empty events → zeros
{
  const r = projectPlantEventReasonBrief(state([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.uniqueReasons === 0, 'empty: uniqueReasons 0')
  check(r.topReasonsByCount.length === 0, 'empty: topReasonsByCount empty')
}

// 2. Single event
{
  const r = projectPlantEventReasonBrief(state([event({ reason: 'Shift start' })]))
  check(r.totalEvents === 1, 'single: totalEvents 1')
  check(r.uniqueReasons === 1, 'single: uniqueReasons 1')
  check(r.topReasonsByCount[0].reason === 'Shift start', 'single: top reason')
  check(r.topReasonsByCount[0].count === 1, 'single: count 1')
}

// 3. All distinct reasons
{
  const r = projectPlantEventReasonBrief(state([
    event({ reason: 'A' }), event({ reason: 'B' }), event({ reason: 'C' }),
  ]))
  check(r.totalEvents === 3, 'distinct: totalEvents 3')
  check(r.uniqueReasons === 3, 'distinct: uniqueReasons 3')
}

// 4. Repeated reasons: count accumulation and sort order
{
  const r = projectPlantEventReasonBrief(state([
    event({ reason: 'Machine jam' }),
    event({ reason: 'Shift start' }),
    event({ reason: 'Machine jam' }),
    event({ reason: 'Machine jam' }),
    event({ reason: 'Shift start' }),
  ]))
  check(r.totalEvents === 5, 'repeated: totalEvents 5')
  check(r.uniqueReasons === 2, 'repeated: uniqueReasons 2')
  check(r.topReasonsByCount[0].reason === 'Machine jam', 'repeated: Machine jam first')
  check(r.topReasonsByCount[0].count === 3, 'repeated: Machine jam count 3')
  check(r.topReasonsByCount[1].reason === 'Shift start', 'repeated: Shift start second')
}

// 5. Alphabetical tie-break for equal counts
{
  const r = projectPlantEventReasonBrief(state([event({ reason: 'Zebra' }), event({ reason: 'Apple' })]))
  check(r.topReasonsByCount[0].reason === 'Apple', 'tiebreak: Apple before Zebra')
}

// 6. Top-5 cap
{
  const reasons = ['A', 'B', 'C', 'D', 'E', 'F'].map(r => event({ reason: r }))
  const result = projectPlantEventReasonBrief(state(reasons))
  check(result.topReasonsByCount.length === 5, 'top5: capped at 5')
  check(result.totalEvents === 6, 'top5: totalEvents 6')
  check(result.uniqueReasons === 6, 'top5: uniqueReasons 6')
}

console.log(JSON.stringify({ ok: true, checks }))
