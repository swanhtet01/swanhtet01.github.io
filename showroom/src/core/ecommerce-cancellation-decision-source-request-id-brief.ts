import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationDecisionSourceRequestIdBrief = {
  totalDecisions: number; uniqueSourceRequests: number; topSourceRequest: string | null; topSourceRequestCount: number
}
export function projectEcommerceCancellationDecisionSourceRequestIdBrief(buying: EcommerceBuyingState) {
  const total = buying.cancellationDecisions.length
  if (total === 0) return { totalDecisions: 0, uniqueSourceRequests: 0, topSourceRequest: null, topSourceRequestCount: 0 }
  const counts = new Map<string, number>()
  for (const decision of buying.cancellationDecisions) {
    counts.set(decision.sourceRequestId, (counts.get(decision.sourceRequestId) ?? 0) + 1)
  }
  let topSourceRequest: string | null = null; let topSourceRequestCount = 0
  for (const [key, count] of counts) { if (count > topSourceRequestCount) { topSourceRequestCount = count; topSourceRequest = key } }
  return { totalDecisions: total, uniqueSourceRequests: counts.size, topSourceRequest, topSourceRequestCount }
}
