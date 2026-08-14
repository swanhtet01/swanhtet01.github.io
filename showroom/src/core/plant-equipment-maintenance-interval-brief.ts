import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentMaintenanceIntervalBrief = {
  totalStrategies: number
  totalIntervalDays: number
  averageIntervalDays: number
  minIntervalDays: number | null
  maxIntervalDays: number | null
  uniqueOwners: number
  topOwnersByStrategies: Array<{ owner: string; count: number }>
}

export function projectPlantEquipmentMaintenanceIntervalBrief(
  production: ProductionState,
): PlantEquipmentMaintenanceIntervalBrief {
  const assets = production.equipmentMaster?.assets ?? []
  let totalStrategies = 0
  let totalIntervalDays = 0
  let minIntervalDays: number | null = null
  let maxIntervalDays: number | null = null
  const ownerMap = new Map<string, number>()

  for (const asset of assets) {
    const strategy = asset.maintenanceStrategy
    if (strategy === undefined) continue
    totalStrategies++
    const days = strategy.intervalDays
    totalIntervalDays += days
    if (minIntervalDays === null || days < minIntervalDays) minIntervalDays = days
    if (maxIntervalDays === null || days > maxIntervalDays) maxIntervalDays = days
    ownerMap.set(strategy.maintenanceOwner, (ownerMap.get(strategy.maintenanceOwner) ?? 0) + 1)
  }

  const topOwnersByStrategies = Array.from(ownerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  return {
    totalStrategies,
    totalIntervalDays,
    averageIntervalDays: totalStrategies > 0 ? Math.round(totalIntervalDays / totalStrategies) : 0,
    minIntervalDays,
    maxIntervalDays,
    uniqueOwners: ownerMap.size,
    topOwnersByStrategies,
  }
}
