import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderShippingDecisionSummary = {
  ordersWithDecision: number
  byStatus: { pickup: number; approved: number; rejected: number }
  totalFeeMmk: number
  uniqueZones: number
}

export function projectShopOrderShippingDecisionSummary(commerce: CommerceState): ShopOrderShippingDecisionSummary {
  const byStatus = { pickup: 0, approved: 0, rejected: 0 }
  const zoneSet = new Set<string>()
  let ordersWithDecision = 0
  let totalFeeMmk = 0

  for (const order of commerce.orders) {
    if (order.shippingDecision === undefined) continue
    ordersWithDecision++
    byStatus[order.shippingDecision.status]++
    totalFeeMmk += order.shippingDecision.feeMmk
    if (order.shippingDecision.zoneCode !== null) zoneSet.add(order.shippingDecision.zoneCode)
  }

  return { ordersWithDecision, byStatus, totalFeeMmk, uniqueZones: zoneSet.size }
}
