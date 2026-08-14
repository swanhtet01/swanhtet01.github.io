import type { ProductionState } from './production-workspace.ts'

export type PlantEventMaintenanceStrategySaveBrief = {
  totalStrategyEvents: number
  totalStrategyRevisions: number
  averageStrategyRevision: number
  maxStrategyRevision: number
  totalIntervalDays: number
  averageIntervalDays: number
  maxIntervalDays: number
  uniqueProcedureReferences: number
  topProcedureReferencesByCount: Array<{ reference: string; count: number }>
}

export function projectPlantEventMaintenanceStrategySaveBrief(
  production: ProductionState,
): PlantEventMaintenanceStrategySaveBrief {
  let totalStrategyEvents = 0
  let totalStrategyRevisions = 0
  let maxStrategyRevision = 0
  let totalIntervalDays = 0
  let maxIntervalDays = 0
  const procedureRefMap = new Map<string, number>()

  for (const event of production.events) {
    if (event.kind !== 'equipment_maintenance_strategy_saved') continue
    totalStrategyEvents++

    if (event.strategyRevision !== undefined) {
      const rev = event.strategyRevision
      totalStrategyRevisions += rev
      if (rev > maxStrategyRevision) maxStrategyRevision = rev
    }

    if (event.intervalDays !== undefined) {
      const days = event.intervalDays
      totalIntervalDays += days
      if (days > maxIntervalDays) maxIntervalDays = days
    }

    if (event.procedureReference !== undefined) {
      procedureRefMap.set(
        event.procedureReference,
        (procedureRefMap.get(event.procedureReference) ?? 0) + 1,
      )
    }
  }

  const topProcedureReferencesByCount = Array.from(procedureRefMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalStrategyEvents,
    totalStrategyRevisions,
    averageStrategyRevision:
      totalStrategyEvents > 0 ? Math.round(totalStrategyRevisions / totalStrategyEvents) : 0,
    maxStrategyRevision,
    totalIntervalDays,
    averageIntervalDays:
      totalStrategyEvents > 0 ? Math.round(totalIntervalDays / totalStrategyEvents) : 0,
    maxIntervalDays,
    uniqueProcedureReferences: procedureRefMap.size,
    topProcedureReferencesByCount,
  }
}
