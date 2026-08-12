import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationIntentSourceRequestIdBrief = {
  totalIntents: number; uniqueSourceRequests: number; topSourceRequest: string | null; topSourceRequestCount: number
}
export function projectEcommerceCancellationIntentSourceRequestIdBrief(buying: EcommerceBuyingState) {
  const total = buying.cancellationIntents.length
  if (total === 0) return { totalIntents: 0, uniqueSourceRequests: 0, topSourceRequest: null, topSourceRequestCount: 0 }
  const counts = new Map<string, number>()
  for (const intent of buying.cancellationIntents) {
    counts.set(intent.sourceRequestId, (counts.get(intent.sourceRequestId) ?? 0) + 1)
  }
  let topSourceRequest: string | null = null; let topSourceRequestCount = 0
  for (const [key, count] of counts) { if (count > topSourceRequestCount) { topSourceRequestCount = count; topSourceRequest = key } }
  return { totalIntents: total, uniqueSourceRequests: counts.size, topSourceRequest, topSourceRequestCount }
}
