import type { ProductionState } from './production-workspace.ts'

export type DowntimeMachineRecord = {
  machineId: string
  completedCount: number
  totalDowntimeMinutes: number
}

export type PlantDowntimeSummary = {
  totalIncidents: number
  completedIntervals: number
  activeDowntimeCount: number
  totalDowntimeMinutes: number
  averageDowntimeMinutes: number
  longestIncidentMinutes: number
  byMachine: DowntimeMachineRecord[]
}

export function projectPlantDowntimeSummary(production: ProductionState): PlantDowntimeSummary {
  const startMap = new Map<string, { startedAt: number; machineId: string }>()
  const pendingStartIds = new Set<string>()

  for (const event of production.events) {
    if (event.kind === 'downtime_started') {
      startMap.set(event.actionId, { startedAt: Date.parse(event.createdAt), machineId: event.subjectId })
      pendingStartIds.add(event.actionId)
    }
  }

  const machineMap = new Map<string, { completedCount: number; totalMinutes: number }>()
  let completedIntervals = 0
  let totalDowntimeMinutes = 0
  let longestIncidentMinutes = 0

  for (const event of production.events) {
    if (event.kind !== 'downtime_ended' || !event.downtimeStartActionId) continue
    const start = startMap.get(event.downtimeStartActionId)
    if (!start) continue
    pendingStartIds.delete(event.downtimeStartActionId)
    const minutes = Math.round((Date.parse(event.createdAt) - start.startedAt) / 60000)
    completedIntervals++
    totalDowntimeMinutes += minutes
    if (minutes > longestIncidentMinutes) longestIncidentMinutes = minutes
    const entry = machineMap.get(start.machineId) ?? { completedCount: 0, totalMinutes: 0 }
    entry.completedCount++
    entry.totalMinutes += minutes
    machineMap.set(start.machineId, entry)
  }

  const byMachine = Array.from(machineMap.entries())
    .map(([machineId, { completedCount, totalMinutes }]) => ({
      machineId,
      completedCount,
      totalDowntimeMinutes: totalMinutes,
    }))
    .sort((a, b) => b.totalDowntimeMinutes - a.totalDowntimeMinutes || a.machineId.localeCompare(b.machineId))

  return {
    totalIncidents: startMap.size,
    completedIntervals,
    activeDowntimeCount: pendingStartIds.size,
    totalDowntimeMinutes,
    averageDowntimeMinutes: completedIntervals > 0 ? Math.round(totalDowntimeMinutes / completedIntervals) : 0,
    longestIncidentMinutes,
    byMachine,
  }
}
