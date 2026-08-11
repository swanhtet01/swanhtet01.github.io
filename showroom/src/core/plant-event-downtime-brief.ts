import type { ProductionState } from './production-workspace.ts'

export type PlantEventDowntimeBrief = {
  totalDowntimeStartEvents: number
  totalDowntimeEndEvents: number
  downtimePairCompletionRate: number
  uniqueDowntimeStartActionIds: number
}

export function projectPlantEventDowntimeBrief(
  production: ProductionState,
): PlantEventDowntimeBrief {
  let totalDowntimeStartEvents = 0
  let totalDowntimeEndEvents = 0
  const startActionIdSet = new Set<string>()

  for (const event of production.events) {
    if (event.kind === 'downtime_started') {
      totalDowntimeStartEvents++
    } else if (event.kind === 'downtime_ended') {
      totalDowntimeEndEvents++
      if (event.downtimeStartActionId !== undefined) {
        startActionIdSet.add(event.downtimeStartActionId)
      }
    }
  }

  return {
    totalDowntimeStartEvents,
    totalDowntimeEndEvents,
    downtimePairCompletionRate:
      totalDowntimeStartEvents > 0
        ? Math.round((totalDowntimeEndEvents / totalDowntimeStartEvents) * 100)
        : 0,
    uniqueDowntimeStartActionIds: startActionIdSet.size,
  }
}
