import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderEvidenceReferenceBrief = {
  totalOrders: number
  ordersWithEvidence: number
  ordersWithoutEvidence: number
  evidenceRate: number
  ordersWithPaymentEvidence: number
  paymentEvidenceRate: number
  ordersWithRefundEvidence: number
  refundEvidenceRate: number
}

export function projectShopOrderEvidenceReferenceBrief(
  commerce: CommerceState,
): ShopOrderEvidenceReferenceBrief {
  let totalOrders = 0
  let ordersWithEvidence = 0
  let ordersWithPaymentEvidence = 0
  let ordersWithRefundEvidence = 0

  for (const order of commerce.orders) {
    totalOrders++
    if (order.evidenceReference !== undefined) ordersWithEvidence++
    if (order.paymentEvidenceReference !== undefined) ordersWithPaymentEvidence++
    if (order.refundEvidenceReference !== undefined) ordersWithRefundEvidence++
  }

  return {
    totalOrders,
    ordersWithEvidence,
    ordersWithoutEvidence: totalOrders - ordersWithEvidence,
    evidenceRate: totalOrders > 0 ? Math.round((ordersWithEvidence / totalOrders) * 100) : 0,
    ordersWithPaymentEvidence,
    paymentEvidenceRate: totalOrders > 0 ? Math.round((ordersWithPaymentEvidence / totalOrders) * 100) : 0,
    ordersWithRefundEvidence,
    refundEvidenceRate: totalOrders > 0 ? Math.round((ordersWithRefundEvidence / totalOrders) * 100) : 0,
  }
}
