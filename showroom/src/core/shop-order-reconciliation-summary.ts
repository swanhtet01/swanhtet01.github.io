import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderReconciliationSummary = {
  ordersReconciled: number
  uniqueReconcilers: number
  ordersWithRefundSettled: number
  uniqueRefundSettlers: number
}

export function projectShopOrderReconciliationSummary(commerce: CommerceState): ShopOrderReconciliationSummary {
  const reconcilerSet = new Set<string>()
  const refundSettlerSet = new Set<string>()
  let ordersReconciled = 0
  let ordersWithRefundSettled = 0

  for (const order of commerce.orders) {
    if (order.paymentReconciledAt !== undefined) {
      ordersReconciled++
      if (order.paymentReconciledBy !== undefined) reconcilerSet.add(order.paymentReconciledBy)
    }
    if (order.refundSettledAt !== undefined) {
      ordersWithRefundSettled++
      if (order.refundSettledBy !== undefined) refundSettlerSet.add(order.refundSettledBy)
    }
  }

  return {
    ordersReconciled,
    uniqueReconcilers: reconcilerSet.size,
    ordersWithRefundSettled,
    uniqueRefundSettlers: refundSettlerSet.size,
  }
}
