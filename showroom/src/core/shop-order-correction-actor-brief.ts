import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCorrectionActorBrief = {
  totalCorrections: number
  uniqueActors: number
  topActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopOrderCorrectionActorBrief(commerce: CommerceState): ShopOrderCorrectionActorBrief {
  let totalCorrections = 0
  const actorMap = new Map<string, number>()

  for (const order of commerce.orders) {
    for (const correction of order.corrections ?? []) {
      totalCorrections++
      actorMap.set(correction.actor, (actorMap.get(correction.actor) ?? 0) + 1)
    }
  }

  const topActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalCorrections,
    uniqueActors: actorMap.size,
    topActorsByCount,
  }
}
