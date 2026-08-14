import type { ProductionState } from './production-workspace.ts'

export type PlantEventWorkCentreBrief = {
  totalEvents: number
  eventsWithWorkCentre: number
  eventsWithoutWorkCentre: number
  workCentreCoverage: number
  uniqueWorkCentres: number
  topWorkCentresByEvents: Array<{ workCentreId: string; count: number }>
}

export function projectPlantEventWorkCentreBrief(production: ProductionState): PlantEventWorkCentreBrief {
  let totalEvents = 0
  let eventsWithWorkCentre = 0
  const centreMap = new Map<string, number>()

  for (const event of production.events ?? []) {
    totalEvents++
    if (event.workCentreId !== undefined) {
      eventsWithWorkCentre++
      centreMap.set(event.workCentreId, (centreMap.get(event.workCentreId) ?? 0) + 1)
    }
  }

  const topWorkCentresByEvents = Array.from(centreMap.entries())
    .map(([workCentreId, count]) => ({ workCentreId, count }))
    .sort((a, b) => b.count - a.count || a.workCentreId.localeCompare(b.workCentreId))
    .slice(0, 5)

  return {
    totalEvents,
    eventsWithWorkCentre,
    eventsWithoutWorkCentre: totalEvents - eventsWithWorkCentre,
    workCentreCoverage: totalEvents > 0 ? Math.round((eventsWithWorkCentre / totalEvents) * 100) : 0,
    uniqueWorkCentres: centreMap.size,
    topWorkCentresByEvents,
  }
}
