import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationDecisionIntentIdBrief = {
  totalDecisions: number; uniqueIntents: number; topIntent: string | null; topIntentCount: number
}
export function projectEcommerceCancellationDecisionIntentIdBrief(buying: EcommerceBuyingState) {
  const total = buying.cancellationDecisions.length
  if (total === 0) return { totalDecisions: 0, uniqueIntents: 0, topIntent: null, topIntentCount: 0 }
  const counts = new Map<string, number>()
  for (const decision of buying.cancellationDecisions) {
    counts.set(decision.intentId, (counts.get(decision.intentId) ?? 0) + 1)
  }
  let topIntent: string | null = null; let topIntentCount = 0
  for (const [key, count] of counts) { if (count > topIntentCount) { topIntentCount = count; topIntent = key } }
  return { totalDecisions: total, uniqueIntents: counts.size, topIntent, topIntentCount }
}
