import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentStrategyDatesBrief = {
  totalStrategies: number
  earliestSavedAt: string | null
  latestSavedAt: string | null
  earliestNextDueAt: string | null
  latestNextDueAt: string | null
}

export function projectPlantEquipmentStrategyDatesBrief(
  production: ProductionState,
): PlantEquipmentStrategyDatesBrief {
  let totalStrategies = 0
  let earliestSavedAt: string | null = null
  let latestSavedAt: string | null = null
  let earliestNextDueAt: string | null = null
  let latestNextDueAt: string | null = null

  for (const asset of production.equipmentMaster?.assets ?? []) {
    const strategy = asset.maintenanceStrategy
    if (strategy === undefined) continue
    totalStrategies++
    const saved = strategy.savedAt
    if (earliestSavedAt === null || saved < earliestSavedAt) earliestSavedAt = saved
    if (latestSavedAt === null || saved > latestSavedAt) latestSavedAt = saved
    const nextDue = strategy.nextDueAt
    if (earliestNextDueAt === null || nextDue < earliestNextDueAt) earliestNextDueAt = nextDue
    if (latestNextDueAt === null || nextDue > latestNextDueAt) latestNextDueAt = nextDue
  }

  return {
    totalStrategies,
    earliestSavedAt,
    latestSavedAt,
    earliestNextDueAt,
    latestNextDueAt,
  }
}
