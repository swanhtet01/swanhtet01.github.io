import type { ProductionState } from './production-workspace.ts'

export type PlantEventMaintenanceBrief = {
  totalMaintenanceStartEvents: number
  totalMaintenanceCompleteEvents: number
  uniqueMaintenanceOwners: number
  topMaintenanceOwnersByCount: Array<{ owner: string; count: number }>
  completedOutcomeCount: number
  completedWithFindingsOutcomeCount: number
  procedureCompletedCount: number
  procedureCompletionRate: number
}

export function projectPlantEventMaintenanceBrief(
  production: ProductionState,
): PlantEventMaintenanceBrief {
  let totalMaintenanceStartEvents = 0
  let totalMaintenanceCompleteEvents = 0
  let completedOutcomeCount = 0
  let completedWithFindingsOutcomeCount = 0
  let procedureCompletedCount = 0
  const ownerMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.kind === 'maintenance_started') {
      totalMaintenanceStartEvents++
      if (event.maintenanceOwner !== undefined) {
        ownerMap.set(event.maintenanceOwner, (ownerMap.get(event.maintenanceOwner) ?? 0) + 1)
      }
    } else if (event.kind === 'maintenance_completed') {
      totalMaintenanceCompleteEvents++
      if (event.maintenanceOwner !== undefined) {
        ownerMap.set(event.maintenanceOwner, (ownerMap.get(event.maintenanceOwner) ?? 0) + 1)
      }
      if (event.maintenanceOutcome === 'completed') completedOutcomeCount++
      else if (event.maintenanceOutcome === 'completed_with_findings') completedWithFindingsOutcomeCount++
      if (event.maintenanceProcedureCompleted === true) procedureCompletedCount++
    }
  }

  const topMaintenanceOwnersByCount = Array.from(ownerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  return {
    totalMaintenanceStartEvents,
    totalMaintenanceCompleteEvents,
    uniqueMaintenanceOwners: ownerMap.size,
    topMaintenanceOwnersByCount,
    completedOutcomeCount,
    completedWithFindingsOutcomeCount,
    procedureCompletedCount,
    procedureCompletionRate:
      totalMaintenanceCompleteEvents > 0
        ? Math.round((procedureCompletedCount / totalMaintenanceCompleteEvents) * 100)
        : 0,
  }
}
