import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderReconciliationReasonBrief = {
  totalReconciledOrders: number
  uniqueReconciliationReasons: number
  topReconciliationReasonsByCount: Array<{ reason: string; count: number }>
  totalSettledOrders: number
  uniqueSettlementReasons: number
  topSettlementReasonsByCount: Array<{ reason: string; count: number }>
}

export function projectShopOrderReconciliationReasonBrief(
  commerce: CommerceState,
): ShopOrderReconciliationReasonBrief {
  let totalReconciledOrders = 0
  let totalSettledOrders = 0
  const reconciliationReasonMap = new Map<string, number>()
  const settlementReasonMap = new Map<string, number>()

  for (const order of commerce.orders) {
    if (order.paymentReconciledAt !== undefined) {
      totalReconciledOrders++
      if (order.paymentReconciliationReason !== undefined) {
        reconciliationReasonMap.set(
          order.paymentReconciliationReason,
          (reconciliationReasonMap.get(order.paymentReconciliationReason) ?? 0) + 1,
        )
      }
    }
    if (order.refundSettledAt !== undefined) {
      totalSettledOrders++
      if (order.refundSettlementReason !== undefined) {
        settlementReasonMap.set(
          order.refundSettlementReason,
          (settlementReasonMap.get(order.refundSettlementReason) ?? 0) + 1,
        )
      }
    }
  }

  const topReconciliationReasonsByCount = Array.from(reconciliationReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  const topSettlementReasonsByCount = Array.from(settlementReasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalReconciledOrders,
    uniqueReconciliationReasons: reconciliationReasonMap.size,
    topReconciliationReasonsByCount,
    totalSettledOrders,
    uniqueSettlementReasons: settlementReasonMap.size,
    topSettlementReasonsByCount,
  }
}
