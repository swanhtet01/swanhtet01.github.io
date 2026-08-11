// Plant maintenance return-to-service brief: ProductionMaintenanceReturnToService distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantMaintenanceReturnToServiceBrief } from './plant-maintenance-return-to-service-brief.ts'`,
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

const { projectPlantMaintenanceReturnToServiceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let eventId = 0
function completedEvent({ returnToService } = {}) {
  eventId++
  return {
    actionId: `act-maint-${eventId}`,
    kind: 'maintenance_completed',
    createdAt: '2026-08-11T11:00:00Z',
    subjectId: `machine-${eventId}`,
    subjectKind: 'machine',
    actor: 'tech-01',
    ...(returnToService !== undefined && { maintenanceReturnToService: returnToService }),
  }
}

function otherEvent() {
  eventId++
  return {
    actionId: `act-other-${eventId}`,
    kind: 'maintenance_started',
    createdAt: '2026-08-11T10:00:00Z',
    subjectId: `machine-${eventId}`,
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
  const r = projectPlantMaintenanceReturnToServiceBrief(state([]))
  check(r.totalCompletedEvents === 0, 'empty: totalCompletedEvents 0')
  check(r.eventsWithReturnToService === 0, 'empty: eventsWithReturnToService 0')
  check(r.eventsWithoutReturnToService === 0, 'empty: eventsWithoutReturnToService 0')
  check(r.returnToServiceCoverage === 0, 'empty: returnToServiceCoverage 0')
  check(r.byReturnToService.recommended === 0, 'empty: recommended 0')
  check(r.byReturnToService.restricted === 0, 'empty: restricted 0')
  check(r.byReturnToService.notRecommended === 0, 'empty: notRecommended 0')
  check(r.restrictedOrNotRecommendedRate === 0, 'empty: restrictedOrNotRecommendedRate 0')
}

// 2. Non-maintenance events ignored
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([otherEvent(), otherEvent()]))
  check(r.totalCompletedEvents === 0, 'non-maint: totalCompletedEvents 0')
}

// 3. Completed event without return-to-service
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([completedEvent()]))
  check(r.totalCompletedEvents === 1, 'no-rts: totalCompletedEvents 1')
  check(r.eventsWithReturnToService === 0, 'no-rts: eventsWithReturnToService 0')
  check(r.eventsWithoutReturnToService === 1, 'no-rts: eventsWithoutReturnToService 1')
  check(r.returnToServiceCoverage === 0, 'no-rts: returnToServiceCoverage 0')
}

// 4. recommended
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([
    completedEvent({ returnToService: 'recommended' }),
  ]))
  check(r.byReturnToService.recommended === 1, 'recommended: recommended 1')
  check(r.eventsWithReturnToService === 1, 'recommended: eventsWithReturnToService 1')
  check(r.returnToServiceCoverage === 100, 'recommended: returnToServiceCoverage 100')
  check(r.restrictedOrNotRecommendedRate === 0, 'recommended: restrictedOrNotRecommendedRate 0')
}

// 5. restricted → counted in restrictedOrNotRecommendedRate
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([
    completedEvent({ returnToService: 'restricted' }),
  ]))
  check(r.byReturnToService.restricted === 1, 'restricted: restricted 1')
  check(r.restrictedOrNotRecommendedRate === 100, 'restricted: restrictedOrNotRecommendedRate 100')
}

// 6. not_recommended → counted in restrictedOrNotRecommendedRate
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([
    completedEvent({ returnToService: 'not_recommended' }),
  ]))
  check(r.byReturnToService.notRecommended === 1, 'not-recommended: notRecommended 1')
  check(r.restrictedOrNotRecommendedRate === 100, 'not-recommended: restrictedOrNotRecommendedRate 100')
}

// 7. All three RTS values
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([
    completedEvent({ returnToService: 'recommended' }),
    completedEvent({ returnToService: 'restricted' }),
    completedEvent({ returnToService: 'not_recommended' }),
  ]))
  check(r.byReturnToService.recommended === 1, 'all-rts: recommended 1')
  check(r.byReturnToService.restricted === 1, 'all-rts: restricted 1')
  check(r.byReturnToService.notRecommended === 1, 'all-rts: notRecommended 1')
  check(r.totalCompletedEvents === 3, 'all-rts: totalCompletedEvents 3')
  check(r.returnToServiceCoverage === 100, 'all-rts: returnToServiceCoverage 100')
  check(r.restrictedOrNotRecommendedRate === 67, 'all-rts: restrictedOrNotRecommendedRate 67 (2/3)')
}

// 8. Mixed: some with RTS, some without
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([
    completedEvent({ returnToService: 'recommended' }),
    completedEvent(),
  ]))
  check(r.totalCompletedEvents === 2, 'mixed: totalCompletedEvents 2')
  check(r.eventsWithReturnToService === 1, 'mixed: eventsWithReturnToService 1')
  check(r.eventsWithoutReturnToService === 1, 'mixed: eventsWithoutReturnToService 1')
  check(r.returnToServiceCoverage === 50, 'mixed: returnToServiceCoverage 50')
}

// 9. restrictedOrNotRecommendedRate 0-guards on eventsWithReturnToService = 0
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([completedEvent()]))
  check(r.restrictedOrNotRecommendedRate === 0, 'no-rts-events: restrictedOrNotRecommendedRate 0 (guard)')
}

// 10. Other events mixed with completed → only maintenance_completed counted
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([
    otherEvent(),
    completedEvent({ returnToService: 'recommended' }),
    otherEvent(),
  ]))
  check(r.totalCompletedEvents === 1, 'mixed-kinds: only maintenance_completed counted')
  check(r.byReturnToService.recommended === 1, 'mixed-kinds: recommended 1')
}

// 11. restrictedOrNotRecommendedRate rounds — 1 of 3 at-risk = 33%
{
  const r = projectPlantMaintenanceReturnToServiceBrief(state([
    completedEvent({ returnToService: 'recommended' }),
    completedEvent({ returnToService: 'recommended' }),
    completedEvent({ returnToService: 'restricted' }),
  ]))
  check(r.restrictedOrNotRecommendedRate === 33, 'round-33pct: restrictedOrNotRecommendedRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
