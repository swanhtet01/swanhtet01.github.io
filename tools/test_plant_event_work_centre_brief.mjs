// Plant event work centre brief: workCentreId distribution on production events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventWorkCentreBrief } from './plant-event-work-centre-brief.ts'`,
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

const { projectPlantEventWorkCentreBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function event({ workCentreId } = {}) {
  eventId++
  return {
    id: `event-${eventId}`,
    actionId: `act-${eventId}`,
    createdAt: '2026-08-11T08:00:00Z',
    actor: 'operator-01',
    reason: 'Recorded.',
    evidenceReference: '',
    kind: 'maintenance_completed',
    subjectId: `job-${eventId}`,
    summary: 'Maintenance done.',
    ...(workCentreId !== undefined && { workCentreId }),
  }
}

function state(events) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 1,
    jobs: [],
    issues: [],
    machines: [],
    events: events ?? [],
  }
}

// 1. Empty → all zeros, empty topWorkCentres
{
  const r = projectPlantEventWorkCentreBrief(state([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.eventsWithWorkCentre === 0, 'empty: eventsWithWorkCentre 0')
  check(r.eventsWithoutWorkCentre === 0, 'empty: eventsWithoutWorkCentre 0')
  check(r.workCentreCoverage === 0, 'empty: workCentreCoverage 0')
  check(r.uniqueWorkCentres === 0, 'empty: uniqueWorkCentres 0')
  check(r.topWorkCentresByEvents.length === 0, 'empty: topWorkCentres empty')
}

// 2. Event without workCentreId
{
  const r = projectPlantEventWorkCentreBrief(state([event()]))
  check(r.totalEvents === 1, 'no-centre: totalEvents 1')
  check(r.eventsWithWorkCentre === 0, 'no-centre: eventsWithWorkCentre 0')
  check(r.eventsWithoutWorkCentre === 1, 'no-centre: eventsWithoutWorkCentre 1')
  check(r.workCentreCoverage === 0, 'no-centre: workCentreCoverage 0')
  check(r.uniqueWorkCentres === 0, 'no-centre: uniqueWorkCentres 0')
}

// 3. Event with workCentreId
{
  const r = projectPlantEventWorkCentreBrief(state([event({ workCentreId: 'WC-01' })]))
  check(r.eventsWithWorkCentre === 1, 'with-centre: eventsWithWorkCentre 1')
  check(r.eventsWithoutWorkCentre === 0, 'with-centre: eventsWithoutWorkCentre 0')
  check(r.workCentreCoverage === 100, 'with-centre: workCentreCoverage 100')
  check(r.uniqueWorkCentres === 1, 'with-centre: uniqueWorkCentres 1')
  check(r.topWorkCentresByEvents[0].workCentreId === 'WC-01', 'with-centre: WC-01 in top')
  check(r.topWorkCentresByEvents[0].count === 1, 'with-centre: count 1')
}

// 4. Same work centre on multiple events → count accumulates
{
  const r = projectPlantEventWorkCentreBrief(state([
    event({ workCentreId: 'WC-01' }),
    event({ workCentreId: 'WC-01' }),
  ]))
  check(r.uniqueWorkCentres === 1, 'same-centre: uniqueWorkCentres 1')
  check(r.topWorkCentresByEvents[0].count === 2, 'same-centre: count 2')
}

// 5. Two different work centres
{
  const r = projectPlantEventWorkCentreBrief(state([
    event({ workCentreId: 'WC-01' }),
    event({ workCentreId: 'WC-02' }),
  ]))
  check(r.uniqueWorkCentres === 2, 'two-centres: uniqueWorkCentres 2')
}

// 6. workCentreCoverage rounds — 1 of 3 = 33%
{
  const r = projectPlantEventWorkCentreBrief(state([
    event({ workCentreId: 'WC-01' }),
    event(),
    event(),
  ]))
  check(r.workCentreCoverage === 33, 'round-33pct: workCentreCoverage 33')
}

// 7. topWorkCentresByEvents sorted by count desc, secondary localeCompare asc
{
  const r = projectPlantEventWorkCentreBrief(state([
    event({ workCentreId: 'WC-B' }),
    event({ workCentreId: 'WC-A' }),
    event({ workCentreId: 'WC-B' }),
  ]))
  check(r.topWorkCentresByEvents[0].workCentreId === 'WC-B', 'sort: WC-B first (count 2)')
  check(r.topWorkCentresByEvents[1].workCentreId === 'WC-A', 'sort: WC-A second (count 1)')
}

// 8. Secondary sort: same count → alphabetical
{
  const r = projectPlantEventWorkCentreBrief(state([
    event({ workCentreId: 'ZZ-99' }),
    event({ workCentreId: 'AA-01' }),
  ]))
  check(r.topWorkCentresByEvents[0].workCentreId === 'AA-01', 'secondary: AA-01 before ZZ-99')
}

// 9. 6 work centres → only top 5 returned
{
  const events = ['a', 'b', 'c', 'd', 'e', 'f'].map(c => event({ workCentreId: `WC-${c}` }))
  const r = projectPlantEventWorkCentreBrief(state(events))
  check(r.uniqueWorkCentres === 6, 'top-5: uniqueWorkCentres 6')
  check(r.topWorkCentresByEvents.length === 5, 'top-5: topWorkCentres capped at 5')
}

// 10. Mixed: with and without work centre
{
  const r = projectPlantEventWorkCentreBrief(state([
    event({ workCentreId: 'WC-01' }),
    event(),
    event({ workCentreId: 'WC-02' }),
    event({ workCentreId: 'WC-01' }),
  ]))
  check(r.totalEvents === 4, 'mixed: totalEvents 4')
  check(r.eventsWithWorkCentre === 3, 'mixed: eventsWithWorkCentre 3')
  check(r.eventsWithoutWorkCentre === 1, 'mixed: eventsWithoutWorkCentre 1')
  check(r.workCentreCoverage === 75, 'mixed: workCentreCoverage 75')
  check(r.uniqueWorkCentres === 2, 'mixed: uniqueWorkCentres 2')
  check(r.topWorkCentresByEvents[0].workCentreId === 'WC-01', 'mixed: WC-01 top (count 2)')
  check(r.topWorkCentresByEvents[0].count === 2, 'mixed: WC-01 count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
