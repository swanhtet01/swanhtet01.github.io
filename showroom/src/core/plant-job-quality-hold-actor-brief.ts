import type { ProductionState } from './production-workspace.ts'

export type PlantJobQualityHoldActorBrief = {
  totalHolds: number
  uniqueActors: number
  topActorsByCount: Array<{ actor: string; count: number }>
}

export function projectPlantJobQualityHoldActorBrief(
  production: ProductionState,
): PlantJobQualityHoldActorBrief {
  let totalHolds = 0
  const actorMap = new Map<string, number>()

  for (const job of production.jobs) {
    const hold = job.qualityHold
    if (hold === undefined) continue
    totalHolds++
    actorMap.set(hold.heldBy, (actorMap.get(hold.heldBy) ?? 0) + 1)
  }

  const topActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return { totalHolds, uniqueActors: actorMap.size, topActorsByCount }
}
