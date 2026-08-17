// Plant event equipment brief: equipmentIds array participation on production events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventEquipmentBrief } from './plant-event-equipment-brief.ts'`,
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

const { projectPlantEventEquipmentBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function event({ equipmentIds } = {}) {
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
    ...(equipmentIds !== undefined && { equipmentIds }),
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

// 1. Empty → all zeros
{
  const r = projectPlantEventEquipmentBrief(state([]))
  check(r.totalEvents === 0, 'empty: totalEvents 0')
  check(r.eventsWithEquipment === 0, 'empty: eventsWithEquipment 0')
  check(r.eventsWithoutEquipment === 0, 'empty: eventsWithoutEquipment 0')
  check(r.equipmentCoverage === 0, 'empty: equipmentCoverage 0')
  check(r.uniqueEquipmentIds === 0, 'empty: uniqueEquipmentIds 0')
  check(r.topEquipmentByEvents.length === 0, 'empty: topEquipment empty')
}

// 2. Event without equipmentIds
{
  const r = projectPlantEventEquipmentBrief(state([event()]))
  check(r.eventsWithEquipment === 0, 'no-ids: eventsWithEquipment 0')
  check(r.eventsWithoutEquipment === 1, 'no-ids: eventsWithoutEquipment 1')
}

// 3. Event with empty equipmentIds array → treated as without equipment
{
  const r = projectPlantEventEquipmentBrief(state([event({ equipmentIds: [] })]))
  check(r.eventsWithEquipment === 0, 'empty-array: eventsWithEquipment 0 (empty array = no equipment)')
  check(r.eventsWithoutEquipment === 1, 'empty-array: eventsWithoutEquipment 1')
}

// 4. Event with one equipment ID
{
  const r = projectPlantEventEquipmentBrief(state([event({ equipmentIds: ['EQ-01'] })]))
  check(r.eventsWithEquipment === 1, 'single-id: eventsWithEquipment 1')
  check(r.uniqueEquipmentIds === 1, 'single-id: uniqueEquipmentIds 1')
  check(r.topEquipmentByEvents[0].equipmentId === 'EQ-01', 'single-id: EQ-01 in top')
  check(r.topEquipmentByEvents[0].count === 1, 'single-id: count 1')
}

// 5. Event with multiple equipment IDs (multi-equipment event)
{
  const r = projectPlantEventEquipmentBrief(state([event({ equipmentIds: ['EQ-01', 'EQ-02', 'EQ-03'] })]))
  check(r.eventsWithEquipment === 1, 'multi-id: eventsWithEquipment 1 (one event)')
  check(r.uniqueEquipmentIds === 3, 'multi-id: uniqueEquipmentIds 3')
  check(r.topEquipmentByEvents.length === 3, 'multi-id: topEquipment has 3 entries')
}

// 6. Same equipment in multiple events → count accumulates per equipment
{
  const r = projectPlantEventEquipmentBrief(state([
    event({ equipmentIds: ['EQ-01'] }),
    event({ equipmentIds: ['EQ-01'] }),
  ]))
  check(r.uniqueEquipmentIds === 1, 'same-eq: uniqueEquipmentIds 1')
  check(r.topEquipmentByEvents[0].count === 2, 'same-eq: EQ-01 count 2')
}

// 7. Same equipment in two events, plus another equipment once → sort
{
  const r = projectPlantEventEquipmentBrief(state([
    event({ equipmentIds: ['EQ-A', 'EQ-B'] }),
    event({ equipmentIds: ['EQ-A'] }),
  ]))
  check(r.topEquipmentByEvents[0].equipmentId === 'EQ-A', 'sort: EQ-A first (count 2)')
  check(r.topEquipmentByEvents[0].count === 2, 'sort: EQ-A count 2')
  check(r.topEquipmentByEvents[1].equipmentId === 'EQ-B', 'sort: EQ-B second (count 1)')
}

// 8. Secondary sort: same count → alphabetical
{
  const r = projectPlantEventEquipmentBrief(state([
    event({ equipmentIds: ['ZZ-99'] }),
    event({ equipmentIds: ['AA-01'] }),
  ]))
  check(r.topEquipmentByEvents[0].equipmentId === 'AA-01', 'secondary: AA-01 before ZZ-99')
}

// 9. equipmentCoverage rounds — 1 of 3 = 33%
{
  const r = projectPlantEventEquipmentBrief(state([
    event({ equipmentIds: ['EQ-01'] }),
    event(),
    event(),
  ]))
  check(r.equipmentCoverage === 33, 'round-33pct: equipmentCoverage 33')
}

// 10. 6 unique equipment IDs → only top 5 returned
{
  const events = [['EQ-a', 'EQ-b', 'EQ-c'], ['EQ-d', 'EQ-e', 'EQ-f']].map(ids => event({ equipmentIds: ids }))
  const r = projectPlantEventEquipmentBrief(state(events))
  check(r.uniqueEquipmentIds === 6, 'top-5: uniqueEquipmentIds 6')
  check(r.topEquipmentByEvents.length === 5, 'top-5: topEquipment capped at 5')
}

// 11. Mixed: with and without equipment
{
  const r = projectPlantEventEquipmentBrief(state([
    event({ equipmentIds: ['EQ-01'] }),
    event(),
    event({ equipmentIds: ['EQ-01', 'EQ-02'] }),
  ]))
  check(r.totalEvents === 3, 'mixed: totalEvents 3')
  check(r.eventsWithEquipment === 2, 'mixed: eventsWithEquipment 2')
  check(r.eventsWithoutEquipment === 1, 'mixed: eventsWithoutEquipment 1')
  check(r.uniqueEquipmentIds === 2, 'mixed: uniqueEquipmentIds 2')
  check(r.topEquipmentByEvents[0].equipmentId === 'EQ-01', 'mixed: EQ-01 top (appears in 2 events)')
  check(r.topEquipmentByEvents[0].count === 2, 'mixed: EQ-01 count 2')
}

console.log(JSON.stringify({ ok: true, checks }))
