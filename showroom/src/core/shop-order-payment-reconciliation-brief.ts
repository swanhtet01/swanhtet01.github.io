import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderPaymentReconciliationBrief = {
  totalOrders: number
  reconciledOrders: number
  reconciliationRate: number
  earliestReconciledAt: string | null
  latestReconciledAt: string | null
  uniqueReconciledByActors: number
  topReconciledByActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopOrderPaymentReconciliationBrief(
  commerce: CommerceState,
): ShopOrderPaymentReconciliationBrief {
  let totalOrders = 0
  let reconciledOrders = 0
  let earliestReconciledAt: string | null = null
  let latestReconciledAt: string | null = null
  const actorMap = new Map<string, number>()

  for (const order of commerce.orders) {
    totalOrders++
    if (order.paymentReconciledAt === undefined) continue
    reconciledOrders++
    const at = order.paymentReconciledAt
    if (earliestReconciledAt === null || at < earliestReconciledAt) earliestReconciledAt = at
    if (latestReconciledAt === null || at > latestReconciledAt) latestReconciledAt = at
    if (order.paymentReconciledBy !== undefined) {
      actorMap.set(order.paymentReconciledBy, (actorMap.get(order.paymentReconciledBy) ?? 0) + 1)
    }
  }

  const topReconciledByActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalOrders,
    reconciledOrders,
    reconciliationRate:
      totalOrders > 0 ? Math.round((reconciledOrders / totalOrders) * 100) : 0,
    earliestReconciledAt,
    latestReconciledAt,
    uniqueReconciledByActors: actorMap.size,
    topReconciledByActorsByCount,
  }
}
