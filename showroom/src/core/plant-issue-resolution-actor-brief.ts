import type { ProductionState } from './production-workspace.ts'

export type PlantIssueResolutionActorBrief = {
  totalResolutions: number
  uniqueActors: number
  topActorsByCount: Array<{ actor: string; count: number }>
}

export function projectPlantIssueResolutionActorBrief(
  production: ProductionState,
): PlantIssueResolutionActorBrief {
  let totalResolutions = 0
  const actorMap = new Map<string, number>()

  for (const issue of production.issues ?? []) {
    const resolution = issue.resolution
    if (resolution === undefined) continue
    totalResolutions++
    actorMap.set(resolution.resolvedBy, (actorMap.get(resolution.resolvedBy) ?? 0) + 1)
  }

  const topActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return { totalResolutions, uniqueActors: actorMap.size, topActorsByCount }
}
