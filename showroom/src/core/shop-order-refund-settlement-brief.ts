import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderRefundSettlementBrief = {
  totalOrders: number
  settledOrders: number
  settlementRate: number
  earliestSettledAt: string | null
  latestSettledAt: string | null
  uniqueSettledByActors: number
  topSettledByActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopOrderRefundSettlementBrief(
  commerce: CommerceState,
): ShopOrderRefundSettlementBrief {
  let totalOrders = 0
  let settledOrders = 0
  let earliestSettledAt: string | null = null
  let latestSettledAt: string | null = null
  const actorMap = new Map<string, number>()

  for (const order of commerce.orders) {
    totalOrders++
    if (order.refundSettledAt === undefined) continue
    settledOrders++
    const at = order.refundSettledAt
    if (earliestSettledAt === null || at < earliestSettledAt) earliestSettledAt = at
    if (latestSettledAt === null || at > latestSettledAt) latestSettledAt = at
    if (order.refundSettledBy !== undefined) {
      actorMap.set(order.refundSettledBy, (actorMap.get(order.refundSettledBy) ?? 0) + 1)
    }
  }

  const topSettledByActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalOrders,
    settledOrders,
    settlementRate: totalOrders > 0 ? Math.round((settledOrders / totalOrders) * 100) : 0,
    earliestSettledAt,
    latestSettledAt,
    uniqueSettledByActors: actorMap.size,
    topSettledByActorsByCount,
  }
}
