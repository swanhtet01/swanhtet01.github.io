import type { ProductionState } from './production-workspace.ts'

export type PlantEquipmentStrategyRevisionBrief = {
  totalStrategies: number
  totalRevisions: number
  averageRevision: number
  maxRevision: number | null
  uniqueSavedByActors: number
  topSavedByActorsByCount: Array<{ actor: string; count: number }>
}

export function projectPlantEquipmentStrategyRevisionBrief(
  production: ProductionState,
): PlantEquipmentStrategyRevisionBrief {
  let totalStrategies = 0
  let totalRevisions = 0
  let maxRevision: number | null = null
  const actorMap = new Map<string, number>()

  for (const asset of production.equipmentMaster?.assets ?? []) {
    const strategy = asset.maintenanceStrategy
    if (strategy === undefined) continue
    totalStrategies++
    const rev = strategy.revision
    totalRevisions += rev
    if (maxRevision === null || rev > maxRevision) maxRevision = rev
    const actor = strategy.savedBy
    actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1)
  }

  const topSavedByActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalStrategies,
    totalRevisions,
    averageRevision: totalStrategies > 0 ? Math.round(totalRevisions / totalStrategies) : 0,
    maxRevision,
    uniqueSavedByActors: actorMap.size,
    topSavedByActorsByCount,
  }
}
