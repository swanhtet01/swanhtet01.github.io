import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderDecisionQualityBrief = {
  paymentApprovalRate: number
  shippingApprovalRate: number
  promotionApprovalRate: number
  totalShippingFeeMmk: number
  totalDiscountMmk: number
  totalCreditExtendedMmk: number
  totalTaxFromCalculationMmk: number
}

export function projectShopOrderDecisionQualityBrief(commerce: CommerceState): ShopOrderDecisionQualityBrief {
  let paymentApproved = 0, paymentRejected = 0
  let shippingApproved = 0, shippingRejected = 0
  let promotionApproved = 0, promotionRejected = 0
  let totalShippingFeeMmk = 0
  let totalDiscountMmk = 0
  let totalCreditExtendedMmk = 0
  let totalTaxFromCalculationMmk = 0

  for (const order of commerce.orders) {
    if (order.paymentDecision !== undefined) {
      if (order.paymentDecision.status === 'approved') paymentApproved++
      else paymentRejected++
    }
    if (order.shippingDecision !== undefined) {
      if (order.shippingDecision.status === 'approved') {
        shippingApproved++
        totalShippingFeeMmk += order.shippingDecision.feeMmk
      } else if (order.shippingDecision.status === 'rejected') {
        shippingRejected++
      }
    }
    if (order.promotionDecision !== undefined && order.promotionDecision.status !== 'not_requested') {
      if (order.promotionDecision.status === 'approved') {
        promotionApproved++
        totalDiscountMmk += order.promotionDecision.discountMmk
      } else {
        promotionRejected++
      }
    }
    if (order.creditDecision !== undefined) {
      totalCreditExtendedMmk += order.creditDecision.orderAmountMmk
    }
    if (order.calculation !== undefined) {
      totalTaxFromCalculationMmk += order.calculation.taxMmk
    }
  }

  const rate = (a: number, b: number) =>
    a + b > 0 ? Math.round((a / (a + b)) * 100) : 0

  return {
    paymentApprovalRate: rate(paymentApproved, paymentRejected),
    shippingApprovalRate: rate(shippingApproved, shippingRejected),
    promotionApprovalRate: rate(promotionApproved, promotionRejected),
    totalShippingFeeMmk,
    totalDiscountMmk,
    totalCreditExtendedMmk,
    totalTaxFromCalculationMmk,
  }
}
