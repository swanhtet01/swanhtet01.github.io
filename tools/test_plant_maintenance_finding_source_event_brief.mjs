// Plant maintenance finding source event brief: maintenance-sourced issue events.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMaintenanceFindingSourceEventBrief } from './plant-maintenance-finding-source-event-brief.ts'`,
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

const { projectPlantMaintenanceFindingSourceEventBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let actionId = 0
function issueOpenedEvent({ equipmentId, returnToService } = {}) {
  actionId++
  return {
    actionId: `act-issue-${actionId}`,
    kind: 'issue_opened',
    createdAt: '2026-08-11T10:00:00Z',
    subjectId: `machine-1`,
    subjectKind: 'machine',
    actor: 'tech-01',
    issueSeverity: 'medium',
    ...(equipmentId !== undefined && {
      maintenanceFindingSource: {
        contract: 'supermega.production.maintenance-finding-source.v1',
        equipmentId,
        equipmentName: `Equipment ${equipmentId}`,
        maintenanceOwner: 'tech-01',
        completionActionId: `comp-act-${actionId}`,
        completedAt: '2026-08-11T09:00:00Z',
        strategyActionId: `strat-${actionId}`,
        strategyRevision: 1,
        returnToService: returnToService ?? 'restricted',
        findings: 'Worn bearing detected.',
        evidenceReference: '',
      },
    }),
  }
}

function otherEvent() {
  actionId++
  return {
    actionId: `act-other-${actionId}`,
    kind: 'maintenance_started',
    createdAt: '2026-08-11T08:00:00Z',
    subjectId: 'machine-1',
    subjectKind: 'machine',
    actor: 'tech-01',
  }
}

function state(events) {
  return {
    schema: 'supermega.plant.production.v1',
    machines: [],
    materials: [],
    jobs: [],
    events: events ?? [],
    qualityHolds: [],
    capas: [],
    openingPlan: null,
    purchaseOrders: [],
  }
}

// 1. Empty → all zeros
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([]))
  check(r.totalIssueOpenedEvents === 0, 'empty: totalIssueOpenedEvents 0')
  check(r.eventsWithFindingSource === 0, 'empty: eventsWithFindingSource 0')
  check(r.eventsWithoutFindingSource === 0, 'empty: eventsWithoutFindingSource 0')
  check(r.findingSourceCoverage === 0, 'empty: findingSourceCoverage 0')
  check(r.uniqueEquipmentIds === 0, 'empty: uniqueEquipmentIds 0')
  check(r.byReturnToService.restricted === 0, 'empty: restricted 0')
  check(r.byReturnToService.notRecommended === 0, 'empty: notRecommended 0')
  check(r.topEquipmentIds.length === 0, 'empty: topEquipmentIds empty')
}

// 2. Non-issue events ignored
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([otherEvent(), otherEvent()]))
  check(r.totalIssueOpenedEvents === 0, 'non-issue: totalIssueOpenedEvents 0')
}

// 3. issue_opened with no finding source
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([issueOpenedEvent()]))
  check(r.totalIssueOpenedEvents === 1, 'no-source: totalIssueOpenedEvents 1')
  check(r.eventsWithFindingSource === 0, 'no-source: eventsWithFindingSource 0')
  check(r.eventsWithoutFindingSource === 1, 'no-source: eventsWithoutFindingSource 1')
  check(r.findingSourceCoverage === 0, 'no-source: findingSourceCoverage 0')
}

// 4. restricted finding source
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'restricted' }),
  ]))
  check(r.eventsWithFindingSource === 1, 'restricted: eventsWithFindingSource 1')
  check(r.byReturnToService.restricted === 1, 'restricted: restricted 1')
  check(r.byReturnToService.notRecommended === 0, 'restricted: notRecommended 0')
  check(r.uniqueEquipmentIds === 1, 'restricted: uniqueEquipmentIds 1')
  check(r.findingSourceCoverage === 100, 'restricted: findingSourceCoverage 100')
  check(r.topEquipmentIds[0]?.equipmentId === 'eq-A', 'restricted: topEquipmentIds[0] eq-A')
  check(r.topEquipmentIds[0]?.issueCount === 1, 'restricted: issueCount 1')
}

// 5. not_recommended finding source
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([
    issueOpenedEvent({ equipmentId: 'eq-B', returnToService: 'not_recommended' }),
  ]))
  check(r.byReturnToService.notRecommended === 1, 'not-recommended: notRecommended 1')
}

// 6. Both return-to-service values
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-B', returnToService: 'not_recommended' }),
  ]))
  check(r.byReturnToService.restricted === 1, 'both-rts: restricted 1')
  check(r.byReturnToService.notRecommended === 1, 'both-rts: notRecommended 1')
  check(r.uniqueEquipmentIds === 2, 'both-rts: uniqueEquipmentIds 2')
}

// 7. Same equipment in multiple issues → counted once in uniqueEquipmentIds, combined in topEquipmentIds
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'restricted' }),
  ]))
  check(r.uniqueEquipmentIds === 1, 'same-equipment: uniqueEquipmentIds 1')
  check(r.topEquipmentIds[0]?.issueCount === 2, 'same-equipment: issueCount 2')
  check(r.totalIssueOpenedEvents === 2, 'same-equipment: totalIssueOpenedEvents 2')
}

// 8. topEquipmentIds sorted descending by issueCount, cap at 5
{
  const events = [
    issueOpenedEvent({ equipmentId: 'eq-B', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-B', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-B', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-C', returnToService: 'not_recommended' }),
    issueOpenedEvent({ equipmentId: 'eq-D', returnToService: 'not_recommended' }),
    issueOpenedEvent({ equipmentId: 'eq-E', returnToService: 'restricted' }),
    issueOpenedEvent({ equipmentId: 'eq-F', returnToService: 'restricted' }),
  ]
  const r = projectPlantMaintenanceFindingSourceEventBrief(state(events))
  check(r.topEquipmentIds.length === 5, 'top-5: capped at 5')
  check(r.topEquipmentIds[0]?.equipmentId === 'eq-B', 'top-5: first is eq-B (3 issues)')
  check(r.topEquipmentIds[0]?.issueCount === 3, 'top-5: eq-B has 3')
  check(r.topEquipmentIds[1]?.equipmentId === 'eq-A', 'top-5: second is eq-A (2 issues)')
  check(r.uniqueEquipmentIds === 6, 'top-5: uniqueEquipmentIds still 6')
}

// 9. Mixed issue events with and without source
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'restricted' }),
    issueOpenedEvent(),
  ]))
  check(r.eventsWithFindingSource === 1, 'mixed: eventsWithFindingSource 1')
  check(r.eventsWithoutFindingSource === 1, 'mixed: eventsWithoutFindingSource 1')
  check(r.findingSourceCoverage === 50, 'mixed: findingSourceCoverage 50')
}

// 10. other event kinds mixed in — only issue_opened counted
{
  const r = projectPlantMaintenanceFindingSourceEventBrief(state([
    otherEvent(),
    issueOpenedEvent({ equipmentId: 'eq-A', returnToService: 'not_recommended' }),
    otherEvent(),
  ]))
  check(r.totalIssueOpenedEvents === 1, 'mixed-kinds: only issue_opened counted')
}

console.log(JSON.stringify({ ok: true, checks }))
