// Plant event commissioning installed brief: installedAt date range + subjectId distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantEventCommissioningInstalledBrief } from './plant-event-commissioning-installed-brief.ts'`,
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

const { projectPlantEventCommissioningInstalledBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function commissionEvent(subjectId, installedAt) {
  eventId++
  const obj = {
    id: `EVT-${eventId}`,
    actionId: `ACT-${eventId}`,
    createdAt: '2026-08-01T10:00:00Z',
    actor: 'engineer-1',
    kind: 'equipment_commissioned',
    subjectId,
    reason: 'New installation',
    evidenceReference: `REF-${eventId}`,
    summary: `Equipment ${subjectId} commissioned`,
  }
  if (installedAt !== undefined) obj.installedAt = installedAt
  return obj
}
function otherEvent() {
  eventId++
  return {
    id: `EVT-${eventId}`,
    actionId: `ACT-O-${eventId}`,
    createdAt: '2026-08-01T08:00:00Z',
    actor: 'worker-1',
    kind: 'output_recorded',
    quantity: 5,
    shiftRef: 'S1',
    outputKind: 'good',
  }
}

function state(events) {
  return {
    schema: 'supermega.production.workspace.v2',
    revision: 0,
    jobs: [],
    issues: [],
    machines: [],
    events,
    openingPlan: null,
    orderExecution: null,
    orderPortfolio: null,
    equipmentMaster: null,
  }
}

// 1. No events → all zeros / nulls
{
  const r = projectPlantEventCommissioningInstalledBrief(state([]))
  check(r.totalCommissioningEvents === 0, 'empty: totalCommissioningEvents 0')
  check(r.eventsWithInstalledAt === 0, 'empty: eventsWithInstalledAt 0')
  check(r.installedAtPresenceRate === 0, 'empty: installedAtPresenceRate 0')
  check(r.earliestInstalledAt === null, 'empty: earliestInstalledAt null')
  check(r.latestInstalledAt === null, 'empty: latestInstalledAt null')
  check(r.uniqueCommissionedEquipment === 0, 'empty: uniqueCommissionedEquipment 0')
  check(r.topCommissionedEquipmentByCount.length === 0, 'empty: top empty')
}

// 2. Other events not counted
{
  const r = projectPlantEventCommissioningInstalledBrief(state([otherEvent(), otherEvent()]))
  check(r.totalCommissioningEvents === 0, 'other: totalCommissioningEvents 0')
}

// 3. Commissioning events without installedAt
{
  const r = projectPlantEventCommissioningInstalledBrief(
    state([commissionEvent('EQ-1'), commissionEvent('EQ-2')]),
  )
  check(r.totalCommissioningEvents === 2, 'no-installed: totalCommissioningEvents 2')
  check(r.eventsWithInstalledAt === 0, 'no-installed: eventsWithInstalledAt 0')
  check(r.installedAtPresenceRate === 0, 'no-installed: installedAtPresenceRate 0')
  check(r.earliestInstalledAt === null, 'no-installed: earliestInstalledAt null')
  check(r.latestInstalledAt === null, 'no-installed: latestInstalledAt null')
  check(r.uniqueCommissionedEquipment === 2, 'no-installed: uniqueCommissionedEquipment 2')
}

// 4. Single event with installedAt
{
  const r = projectPlantEventCommissioningInstalledBrief(
    state([commissionEvent('EQ-1', '2026-01-15T00:00:00Z')]),
  )
  check(r.totalCommissioningEvents === 1, 'single: totalCommissioningEvents 1')
  check(r.eventsWithInstalledAt === 1, 'single: eventsWithInstalledAt 1')
  check(r.installedAtPresenceRate === 100, 'single: installedAtPresenceRate 100')
  check(r.earliestInstalledAt === '2026-01-15T00:00:00Z', 'single: earliest')
  check(r.latestInstalledAt === '2026-01-15T00:00:00Z', 'single: latest equals earliest')
  check(r.uniqueCommissionedEquipment === 1, 'single: uniqueCommissionedEquipment 1')
  check(r.topCommissionedEquipmentByCount[0]?.subjectId === 'EQ-1', 'single: top eq')
  check(r.topCommissionedEquipmentByCount[0]?.count === 1, 'single: top count 1')
}

// 5. Date range — earliest and latest
{
  const r = projectPlantEventCommissioningInstalledBrief(
    state([
      commissionEvent('EQ-1', '2026-03-01T00:00:00Z'),
      commissionEvent('EQ-2', '2026-01-01T00:00:00Z'),
      commissionEvent('EQ-3', '2026-06-15T00:00:00Z'),
    ]),
  )
  check(r.earliestInstalledAt === '2026-01-01T00:00:00Z', 'range: earliest')
  check(r.latestInstalledAt === '2026-06-15T00:00:00Z', 'range: latest')
  check(r.eventsWithInstalledAt === 3, 'range: eventsWithInstalledAt 3')
  check(r.installedAtPresenceRate === 100, 'range: rate 100')
}

// 6. Subject distribution
{
  const r = projectPlantEventCommissioningInstalledBrief(
    state([
      commissionEvent('EQ-1', '2026-01-01T00:00:00Z'),
      commissionEvent('EQ-1', '2026-02-01T00:00:00Z'),
      commissionEvent('EQ-2', '2026-03-01T00:00:00Z'),
    ]),
  )
  check(r.uniqueCommissionedEquipment === 2, 'subject: uniqueCommissionedEquipment 2')
  check(r.topCommissionedEquipmentByCount[0]?.subjectId === 'EQ-1', 'subject: top EQ-1')
  check(r.topCommissionedEquipmentByCount[0]?.count === 2, 'subject: count 2')
  check(r.earliestInstalledAt === '2026-01-01T00:00:00Z', 'subject: earliest spans re-commissions')
}

// 7. Top-5 cap + tiebreak
{
  const ids = ['EQ-Z', 'EQ-A', 'EQ-C', 'EQ-B', 'EQ-D', 'EQ-E']
  const r = projectPlantEventCommissioningInstalledBrief(
    state(ids.map(id => commissionEvent(id))),
  )
  check(r.topCommissionedEquipmentByCount.length === 5, 'top5: capped at 5')
  check(r.topCommissionedEquipmentByCount[0]?.subjectId === 'EQ-A', 'top5: tiebreak EQ-A first')
}

// 8. Mixed — some with installedAt, some without
{
  const r = projectPlantEventCommissioningInstalledBrief(
    state([
      commissionEvent('EQ-1', '2026-01-01T00:00:00Z'),
      commissionEvent('EQ-2'),
      commissionEvent('EQ-3', '2026-05-01T00:00:00Z'),
      commissionEvent('EQ-4'),
    ]),
  )
  check(r.totalCommissioningEvents === 4, 'mixed: totalCommissioningEvents 4')
  check(r.eventsWithInstalledAt === 2, 'mixed: eventsWithInstalledAt 2')
  check(r.installedAtPresenceRate === 50, 'mixed: rate 50')
  check(r.uniqueCommissionedEquipment === 4, 'mixed: uniqueCommissionedEquipment 4')
}

// 9. Presence rate rounds: 1 of 3 → 33%
{
  const r = projectPlantEventCommissioningInstalledBrief(
    state([
      commissionEvent('EQ-1', '2026-01-01T00:00:00Z'),
      commissionEvent('EQ-2'),
      commissionEvent('EQ-3'),
    ]),
  )
  check(r.installedAtPresenceRate === 33, 'round: presenceRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
