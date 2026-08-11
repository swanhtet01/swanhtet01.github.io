import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderRefundExposureBrief = {
  totalCancelledOrders: number
  cancelledWithPaymentReconciled: number
  refundsDue: number
  refundsSettled: number
  totalRefundExposureMmk: number
  totalRefundSettledMmk: number
  refundSettlementRate: number
}

export function projectShopOrderRefundExposureBrief(commerce: CommerceState): ShopOrderRefundExposureBrief {
  let totalCancelledOrders = 0
  let cancelledWithPaymentReconciled = 0
  let refundsDue = 0
  let refundsSettled = 0
  let totalRefundExposureMmk = 0
  let totalRefundSettledMmk = 0

  for (const order of commerce.orders) {
    if (order.status !== 'cancelled') continue
    totalCancelledOrders++
    if (order.paymentStatus !== 'reconciled') continue
    cancelledWithPaymentReconciled++
    if (order.refundStatus === 'due') {
      refundsDue++
      totalRefundExposureMmk += order.total
    } else if (order.refundStatus === 'settled') {
      refundsSettled++
      totalRefundSettledMmk += order.total
    }
  }

  const refundTotal = refundsDue + refundsSettled
  return {
    totalCancelledOrders,
    cancelledWithPaymentReconciled,
    refundsDue,
    refundsSettled,
    totalRefundExposureMmk,
    totalRefundSettledMmk,
    refundSettlementRate: refundTotal > 0 ? Math.round((refundsSettled / refundTotal) * 100) : 0,
  }
}
