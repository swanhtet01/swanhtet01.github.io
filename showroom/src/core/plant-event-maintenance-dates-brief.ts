import type { ProductionState } from './production-workspace.ts'

export type PlantEventMaintenanceDatesBrief = {
  totalMaintenanceEvents: number
  uniqueProcedureReferences: number
  topProcedureReferencesByCount: Array<{ reference: string; count: number }>
  earliestPlannedDueAt: string | null
  latestPlannedDueAt: string | null
  earliestNextDueAt: string | null
  latestNextDueAt: string | null
}

export function projectPlantEventMaintenanceDatesBrief(
  production: ProductionState,
): PlantEventMaintenanceDatesBrief {
  let totalMaintenanceEvents = 0
  let earliestPlannedDueAt: string | null = null
  let latestPlannedDueAt: string | null = null
  let earliestNextDueAt: string | null = null
  let latestNextDueAt: string | null = null
  const procedureRefMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.kind !== 'maintenance_started' && event.kind !== 'maintenance_completed') continue
    totalMaintenanceEvents++

    if (event.maintenanceProcedureReference !== undefined) {
      procedureRefMap.set(
        event.maintenanceProcedureReference,
        (procedureRefMap.get(event.maintenanceProcedureReference) ?? 0) + 1,
      )
    }

    if (event.maintenancePlannedDueAt !== undefined) {
      const d = event.maintenancePlannedDueAt
      if (earliestPlannedDueAt === null || d < earliestPlannedDueAt) earliestPlannedDueAt = d
      if (latestPlannedDueAt === null || d > latestPlannedDueAt) latestPlannedDueAt = d
    }

    if (event.kind === 'maintenance_completed' && event.nextDueAt !== undefined) {
      const d = event.nextDueAt
      if (earliestNextDueAt === null || d < earliestNextDueAt) earliestNextDueAt = d
      if (latestNextDueAt === null || d > latestNextDueAt) latestNextDueAt = d
    }
  }

  const topProcedureReferencesByCount = Array.from(procedureRefMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalMaintenanceEvents,
    uniqueProcedureReferences: procedureRefMap.size,
    topProcedureReferencesByCount,
    earliestPlannedDueAt,
    latestPlannedDueAt,
    earliestNextDueAt,
    latestNextDueAt,
  }
}
