import type { ProductionState } from './production-workspace.ts'

export type PlantEventActorEntry = {
  actor: string
  eventCount: number
}

export type PlantEventKindEntry = {
  kind: string
  count: number
}

export type PlantEventActorBrief = {
  totalEvents: number
  uniqueActors: number
  topActors: PlantEventActorEntry[]
  byEventKind: PlantEventKindEntry[]
  mostCommonEventKind: string | null
}

export function projectPlantEventActorBrief(production: ProductionState): PlantEventActorBrief {
  if (production.events.length === 0) {
    return {
      totalEvents: 0,
      uniqueActors: 0,
      topActors: [],
      byEventKind: [],
      mostCommonEventKind: null,
    }
  }

  const actorMap = new Map<string, number>()
  const kindMap = new Map<string, number>()

  for (const event of production.events) {
    actorMap.set(event.actor, (actorMap.get(event.actor) ?? 0) + 1)
    kindMap.set(event.kind, (kindMap.get(event.kind) ?? 0) + 1)
  }

  const topActors: PlantEventActorEntry[] = Array.from(actorMap.entries())
    .map(([actor, eventCount]) => ({ actor, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 5)

  const byEventKind: PlantEventKindEntry[] = Array.from(kindMap.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalEvents: production.events.length,
    uniqueActors: actorMap.size,
    topActors,
    byEventKind,
    mostCommonEventKind: byEventKind.length > 0 ? byEventKind[0].kind : null,
  }
}
