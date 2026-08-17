import type { ProductionState } from './production-workspace.ts'

export type PlantEventCommissioningStateBrief = {
  totalCommissioningEvents: number
  eventsWithToState: number
  toStatePresenceRate: number
  runningCount: number
  attentionCount: number
  stoppedCount: number
}

export function projectPlantEventCommissioningStateBrief(
  production: ProductionState,
): PlantEventCommissioningStateBrief {
  let totalCommissioningEvents = 0
  let eventsWithToState = 0
  let runningCount = 0
  let attentionCount = 0
  let stoppedCount = 0

  for (const event of production.events) {
    if (event.kind !== 'equipment_commissioned') continue
    totalCommissioningEvents++
    if (event.toState !== undefined) {
      eventsWithToState++
      if (event.toState === 'running') runningCount++
      else if (event.toState === 'attention') attentionCount++
      else if (event.toState === 'stopped') stoppedCount++
    }
  }

  return {
    totalCommissioningEvents,
    eventsWithToState,
    toStatePresenceRate:
      totalCommissioningEvents > 0
        ? Math.round((eventsWithToState / totalCommissioningEvents) * 100)
        : 0,
    runningCount,
    attentionCount,
    stoppedCount,
  }
}
