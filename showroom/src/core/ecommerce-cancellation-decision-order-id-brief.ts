import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationDecisionOrderIdBrief = {
  totalDecisions: number; uniqueOrders: number; topOrder: string | null; topOrderCount: number
}
export function projectEcommerceCancellationDecisionOrderIdBrief(buying: EcommerceBuyingState) {
  const total = buying.cancellationDecisions.length
  if (total === 0) return { totalDecisions: 0, uniqueOrders: 0, topOrder: null, topOrderCount: 0 }
  const counts = new Map<string, number>()
  for (const decision of buying.cancellationDecisions) {
    counts.set(decision.orderId, (counts.get(decision.orderId) ?? 0) + 1)
  }
  let topOrder: string | null = null; let topOrderCount = 0
  for (const [key, count] of counts) { if (count > topOrderCount) { topOrderCount = count; topOrder = key } }
  return { totalDecisions: total, uniqueOrders: counts.size, topOrder, topOrderCount }
}
