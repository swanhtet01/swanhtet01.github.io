import type { CommerceState } from './commerce-workspace.ts'

export type ShopPaymentStatusSummary = {
  totalOrders: number
  pendingPaymentCount: number
  reconciledPaymentCount: number
  pendingPaymentValueMmk: number
  refundsDueCount: number
  refundsSettledCount: number
  paymentReconciliationRate: number
}

export function projectShopPaymentStatusSummary(
  commerce: CommerceState,
  date?: string,
): ShopPaymentStatusSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  let totalOrders = 0
  let pendingPaymentCount = 0
  let reconciledPaymentCount = 0
  let pendingPaymentValueMmk = 0
  let refundsDueCount = 0
  let refundsSettledCount = 0

  for (const order of commerce.orders) {
    if (order.status === 'cancelled') continue
    if (!filter(order.createdAt)) continue
    totalOrders++
    if (order.paymentStatus === 'pending') {
      pendingPaymentCount++
      pendingPaymentValueMmk += order.total
    } else {
      reconciledPaymentCount++
    }
    if (order.refundStatus === 'due') refundsDueCount++
    else if (order.refundStatus === 'settled') refundsSettledCount++
  }

  return {
    totalOrders,
    pendingPaymentCount,
    reconciledPaymentCount,
    pendingPaymentValueMmk,
    refundsDueCount,
    refundsSettledCount,
    paymentReconciliationRate: totalOrders > 0 ? Math.round((reconciledPaymentCount / totalOrders) * 100) : 0,
  }
}
