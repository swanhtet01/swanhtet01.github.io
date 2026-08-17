import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderStatusActorBrief = {
  totalDecisions: number
  confirmedCount: number
  preparingCount: number
  readyCount: number
  confirmedRate: number
  preparingRate: number
  readyRate: number
  uniqueActors: number
  topActorsByCount: Array<{ actor: string; count: number }>
}

export function projectEcommerceCancellationDecisionOrderStatusActorBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderStatusActorBrief {
  const decisions = buying.cancellationDecisions
  const total = decisions.length
  let confirmedCount = 0
  let preparingCount = 0
  let readyCount = 0
  const actorMap = new Map<string, number>()

  for (const decision of decisions) {
    if (decision.orderStatus === 'confirmed') confirmedCount++
    else if (decision.orderStatus === 'preparing') preparingCount++
    else if (decision.orderStatus === 'ready') readyCount++

    actorMap.set(decision.actor, (actorMap.get(decision.actor) ?? 0) + 1)
  }

  const topActorsByCount = [...actorMap.entries()]
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalDecisions: total,
    confirmedCount,
    preparingCount,
    readyCount,
    confirmedRate: total > 0 ? Math.round((confirmedCount / total) * 100) : 0,
    preparingRate: total > 0 ? Math.round((preparingCount / total) * 100) : 0,
    readyRate: total > 0 ? Math.round((readyCount / total) * 100) : 0,
    uniqueActors: actorMap.size,
    topActorsByCount,
  }
}
