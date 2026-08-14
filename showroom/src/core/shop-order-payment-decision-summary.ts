import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderPaymentDecisionSummary = {
  ordersWithDecision: number
  byStatus: { approved: number; rejected: number }
  byAdapter: { pay_on_pickup: number; cash_on_delivery: number; kbzpay_manual: number }
}

export function projectShopOrderPaymentDecisionSummary(commerce: CommerceState): ShopOrderPaymentDecisionSummary {
  const byStatus = { approved: 0, rejected: 0 }
  const byAdapter = { pay_on_pickup: 0, cash_on_delivery: 0, kbzpay_manual: 0 }
  let ordersWithDecision = 0

  for (const order of commerce.orders) {
    if (order.paymentDecision === undefined) continue
    ordersWithDecision++
    byStatus[order.paymentDecision.status]++
    byAdapter[order.paymentDecision.adapter]++
  }

  return { ordersWithDecision, byStatus, byAdapter }
}
