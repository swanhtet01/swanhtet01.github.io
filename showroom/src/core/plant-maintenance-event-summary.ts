import type { ProductionState } from './production-workspace.ts'

export type MaintenanceMachineRecord = {
  machineId: string
  completedCount: number
  completedWithFindingsCount: number
  totalDurationMinutes: number
  nextDueAt: string | null
}

export type PlantMaintenanceEventSummary = {
  totalMaintenanceEvents: number
  completedCount: number
  inProgressCount: number
  completedWithFindingsCount: number
  totalDurationMinutes: number
  averageDurationMinutes: number
  longestMaintenanceMinutes: number
  earliestNextDueAt: string | null
  byMachine: MaintenanceMachineRecord[]
}

type MachineAccum = {
  completedCount: number
  completedWithFindingsCount: number
  totalMinutes: number
  latestCompletedAt: number
  latestNextDueAt: string | null
}

export function projectPlantMaintenanceEventSummary(
  production: ProductionState,
): PlantMaintenanceEventSummary {
  const startMap = new Map<string, { startedAt: number; machineId: string }>()
  const pendingStartIds = new Set<string>()

  for (const event of production.events) {
    if (event.kind === 'maintenance_started') {
      startMap.set(event.actionId, { startedAt: Date.parse(event.createdAt), machineId: event.subjectId })
      pendingStartIds.add(event.actionId)
    }
  }

  const machineMap = new Map<string, MachineAccum>()
  let completedCount = 0
  let completedWithFindingsCount = 0
  let totalDurationMinutes = 0
  let longestMaintenanceMinutes = 0

  for (const event of production.events) {
    if (event.kind !== 'maintenance_completed' || !event.maintenanceStartActionId) continue
    const start = startMap.get(event.maintenanceStartActionId)
    if (!start) continue
    pendingStartIds.delete(event.maintenanceStartActionId)

    const completedAt = Date.parse(event.createdAt)
    const minutes = Math.round((completedAt - start.startedAt) / 60000)
    completedCount++
    totalDurationMinutes += minutes
    if (minutes > longestMaintenanceMinutes) longestMaintenanceMinutes = minutes
    if (event.maintenanceOutcome === 'completed_with_findings') completedWithFindingsCount++

    const machineId = start.machineId
    const entry = machineMap.get(machineId) ?? {
      completedCount: 0,
      completedWithFindingsCount: 0,
      totalMinutes: 0,
      latestCompletedAt: 0,
      latestNextDueAt: null,
    }
    entry.completedCount++
    if (event.maintenanceOutcome === 'completed_with_findings') entry.completedWithFindingsCount++
    entry.totalMinutes += minutes
    if (completedAt > entry.latestCompletedAt) {
      entry.latestCompletedAt = completedAt
      entry.latestNextDueAt = event.nextDueAt ?? null
    }
    machineMap.set(machineId, entry)
  }

  const byMachine: MaintenanceMachineRecord[] = Array.from(machineMap.entries())
    .map(([machineId, acc]) => ({
      machineId,
      completedCount: acc.completedCount,
      completedWithFindingsCount: acc.completedWithFindingsCount,
      totalDurationMinutes: acc.totalMinutes,
      nextDueAt: acc.latestNextDueAt,
    }))
    .sort((a, b) => b.totalDurationMinutes - a.totalDurationMinutes || a.machineId.localeCompare(b.machineId))

  let earliestNextDueAt: string | null = null
  for (const rec of byMachine) {
    if (rec.nextDueAt !== null) {
      if (earliestNextDueAt === null || rec.nextDueAt < earliestNextDueAt) {
        earliestNextDueAt = rec.nextDueAt
      }
    }
  }

  return {
    totalMaintenanceEvents: startMap.size,
    completedCount,
    inProgressCount: pendingStartIds.size,
    completedWithFindingsCount,
    totalDurationMinutes,
    averageDurationMinutes: completedCount > 0 ? Math.round(totalDurationMinutes / completedCount) : 0,
    longestMaintenanceMinutes,
    earliestNextDueAt,
    byMachine,
  }
}
