import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCreditDecisionSummary = {
  ordersWithCreditDecision: number
  totalCreditExtendedMmk: number
  totalExposureAfterMmk: number
  byPaymentTermsDays: { '7': number; '30': number }
}

export function projectShopOrderCreditDecisionSummary(commerce: CommerceState): ShopOrderCreditDecisionSummary {
  const byPaymentTermsDays = { '7': 0, '30': 0 }
  let ordersWithCreditDecision = 0
  let totalCreditExtendedMmk = 0
  let totalExposureAfterMmk = 0

  for (const order of commerce.orders) {
    if (order.creditDecision === undefined) continue
    ordersWithCreditDecision++
    totalCreditExtendedMmk += order.creditDecision.orderAmountMmk
    totalExposureAfterMmk += order.creditDecision.exposureAfterMmk
    byPaymentTermsDays[String(order.creditDecision.paymentTermsDays) as '7' | '30']++
  }

  return { ordersWithCreditDecision, totalCreditExtendedMmk, totalExposureAfterMmk, byPaymentTermsDays }
}
