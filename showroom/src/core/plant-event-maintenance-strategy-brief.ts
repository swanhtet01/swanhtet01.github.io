import type { ProductionState } from './production-workspace.ts'

export type PlantEventMaintenanceStrategyBrief = {
  totalMaintenanceEvents: number
  totalRevisions: number
  averageRevision: number
  maxRevision: number
  eventsWithFindings: number
  uniqueFindings: number
  topFindingsByCount: Array<{ finding: string; count: number }>
}

export function projectPlantEventMaintenanceStrategyBrief(
  production: ProductionState,
): PlantEventMaintenanceStrategyBrief {
  let totalMaintenanceEvents = 0
  let totalRevisions = 0
  let maxRevision = 0
  let eventsWithFindings = 0
  const findingsMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.kind !== 'maintenance_started' && event.kind !== 'maintenance_completed') continue
    totalMaintenanceEvents++

    if (event.maintenanceStrategyRevision !== undefined) {
      const rev = event.maintenanceStrategyRevision
      totalRevisions += rev
      if (rev > maxRevision) maxRevision = rev
    }

    if (event.kind === 'maintenance_completed' && event.maintenanceFindings !== undefined) {
      eventsWithFindings++
      findingsMap.set(
        event.maintenanceFindings,
        (findingsMap.get(event.maintenanceFindings) ?? 0) + 1,
      )
    }
  }

  const topFindingsByCount = Array.from(findingsMap.entries())
    .map(([finding, count]) => ({ finding, count }))
    .sort((a, b) => b.count - a.count || a.finding.localeCompare(b.finding))
    .slice(0, 5)

  return {
    totalMaintenanceEvents,
    totalRevisions,
    averageRevision:
      totalMaintenanceEvents > 0 ? Math.round(totalRevisions / totalMaintenanceEvents) : 0,
    maxRevision,
    eventsWithFindings,
    uniqueFindings: findingsMap.size,
    topFindingsByCount,
  }
}
