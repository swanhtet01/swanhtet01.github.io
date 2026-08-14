import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderReturnActorBrief = {
  totalReturns: number
  uniqueActors: number
  topActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopOrderReturnActorBrief(commerce: CommerceState): ShopOrderReturnActorBrief {
  let totalReturns = 0
  const actorMap = new Map<string, number>()

  for (const order of commerce.orders) {
    for (const ret of order.returns ?? []) {
      totalReturns++
      actorMap.set(ret.actor, (actorMap.get(ret.actor) ?? 0) + 1)
    }
  }

  const topActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return { totalReturns, uniqueActors: actorMap.size, topActorsByCount }
}
