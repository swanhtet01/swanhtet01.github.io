import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderPromotionDecisionSummary = {
  ordersWithDecision: number
  byStatus: { not_requested: number; approved: number; rejected: number }
  totalDiscountMmk: number
  ordersWithCode: number
}

export function projectShopOrderPromotionDecisionSummary(commerce: CommerceState): ShopOrderPromotionDecisionSummary {
  const byStatus = { not_requested: 0, approved: 0, rejected: 0 }
  let ordersWithDecision = 0
  let totalDiscountMmk = 0
  let ordersWithCode = 0

  for (const order of commerce.orders) {
    if (order.promotionDecision === undefined) continue
    ordersWithDecision++
    byStatus[order.promotionDecision.status]++
    totalDiscountMmk += order.promotionDecision.discountMmk
    if (order.promotionDecision.code !== null) ordersWithCode++
  }

  return { ordersWithDecision, byStatus, totalDiscountMmk, ordersWithCode }
}
