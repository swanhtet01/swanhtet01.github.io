import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderActionReasonBrief = {
  totalPurchaseOrders: number
  uniqueCreationReasons: number
  topCreationReasonsByCount: Array<{ reason: string; count: number }>
  purchaseOrdersWithCancellation: number
  cancellationRate: number
  uniqueCancellationReasons: number
  topCancellationReasonsByCount: Array<{ reason: string; count: number }>
}

export function projectShopPurchaseOrderActionReasonBrief(
  commerce: CommerceState,
): ShopPurchaseOrderActionReasonBrief {
  let totalPurchaseOrders = 0
  let purchaseOrdersWithCancellation = 0
  const creationReasonMap = new Map<string, number>()
  const cancellationReasonMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    totalPurchaseOrders++
    const cr = po.creation.reason
    creationReasonMap.set(cr, (creationReasonMap.get(cr) ?? 0) + 1)
    if (po.cancellation !== undefined) {
      purchaseOrdersWithCancellation++
      const canr = po.cancellation.reason
      cancellationReasonMap.set(canr, (cancellationReasonMap.get(canr) ?? 0) + 1)
    }
  }

  const topCreationReasonsByCount = Array.from(creationReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  const topCancellationReasonsByCount = Array.from(cancellationReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalPurchaseOrders,
    uniqueCreationReasons: creationReasonMap.size,
    topCreationReasonsByCount,
    purchaseOrdersWithCancellation,
    cancellationRate:
      totalPurchaseOrders > 0
        ? Math.round((purchaseOrdersWithCancellation / totalPurchaseOrders) * 100)
        : 0,
    uniqueCancellationReasons: cancellationReasonMap.size,
    topCancellationReasonsByCount,
  }
}
