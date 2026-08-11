import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderTaxDecisionSummary = {
  ordersWithTaxDecision: number
  byStatus: { configured: number; not_configured: number }
  totalTaxMmk: number
  uniqueTaxCodes: number
}

export function projectShopOrderTaxDecisionSummary(commerce: CommerceState): ShopOrderTaxDecisionSummary {
  const byStatus = { configured: 0, not_configured: 0 }
  const taxCodeSet = new Set<string>()
  let ordersWithTaxDecision = 0
  let totalTaxMmk = 0

  for (const order of commerce.orders) {
    if (order.taxDecision === undefined) continue
    ordersWithTaxDecision++
    byStatus[order.taxDecision.status]++
    totalTaxMmk += order.taxDecision.taxMmk
    if (order.taxDecision.taxCode !== null) taxCodeSet.add(order.taxDecision.taxCode)
  }

  return { ordersWithTaxDecision, byStatus, totalTaxMmk, uniqueTaxCodes: taxCodeSet.size }
}
