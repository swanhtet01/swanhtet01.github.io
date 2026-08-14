import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderFulfilmentReferenceBrief = {
  totalOrders: number
  ordersWithFulfilmentReference: number
  fulfilmentReferencePresenceRate: number
  uniqueFulfilmentReferences: number
  topFulfilmentReferencesByCount: Array<{ reference: string; count: number }>
}

export function projectShopOrderFulfilmentReferenceBrief(
  commerce: CommerceState,
): ShopOrderFulfilmentReferenceBrief {
  let totalOrders = 0
  let ordersWithFulfilmentReference = 0
  const refMap = new Map<string, number>()

  for (const order of commerce.orders) {
    totalOrders++
    if (order.fulfilmentReference !== undefined) {
      ordersWithFulfilmentReference++
      refMap.set(order.fulfilmentReference, (refMap.get(order.fulfilmentReference) ?? 0) + 1)
    }
  }

  const topFulfilmentReferencesByCount = Array.from(refMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalOrders,
    ordersWithFulfilmentReference,
    fulfilmentReferencePresenceRate:
      totalOrders > 0 ? Math.round((ordersWithFulfilmentReference / totalOrders) * 100) : 0,
    uniqueFulfilmentReferences: refMap.size,
    topFulfilmentReferencesByCount,
  }
}
