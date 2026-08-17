import type { ProductionState } from './production-workspace.ts'

export type PlantJobClosureActorBrief = {
  totalClosures: number
  uniqueActors: number
  topActorsByCount: Array<{ actor: string; count: number }>
}

export function projectPlantJobClosureActorBrief(
  production: ProductionState,
): PlantJobClosureActorBrief {
  let totalClosures = 0
  const actorMap = new Map<string, number>()

  for (const job of production.jobs) {
    const closure = job.closure
    if (closure === undefined) continue
    totalClosures++
    actorMap.set(closure.closedBy, (actorMap.get(closure.closedBy) ?? 0) + 1)
  }

  const topActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return { totalClosures, uniqueActors: actorMap.size, topActorsByCount }
}
