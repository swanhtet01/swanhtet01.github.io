import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationDecisionOrderStatusBrief = {
  totalDecisions: number; confirmedCount: number; preparingCount: number; readyCount: number
}
export function projectEcommerceCancellationDecisionOrderStatusBrief(buying: EcommerceBuyingState): EcommerceCancellationDecisionOrderStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) return { totalDecisions: 0, confirmedCount: 0, preparingCount: 0, readyCount: 0 }
  let confirmedCount = 0; let preparingCount = 0; let readyCount = 0
  for (const decision of buying.cancellationDecisions) {
    if (decision.orderStatus === 'confirmed') confirmedCount++
    else if (decision.orderStatus === 'preparing') preparingCount++
    else readyCount++
  }
  return { totalDecisions: total, confirmedCount, preparingCount, readyCount }
}
