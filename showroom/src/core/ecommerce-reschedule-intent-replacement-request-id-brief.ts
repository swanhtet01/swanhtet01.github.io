import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceRescheduleIntentReplacementRequestIdBrief = {
  totalIntents: number; uniqueReplacements: number; topReplacement: string | null; topReplacementCount: number
}
export function projectEcommerceRescheduleIntentReplacementRequestIdBrief(buying: EcommerceBuyingState) {
  const total = buying.rescheduleIntents.length
  if (total === 0) return { totalIntents: 0, uniqueReplacements: 0, topReplacement: null, topReplacementCount: 0 }
  const counts = new Map<string, number>()
  for (const intent of buying.rescheduleIntents) {
    counts.set(intent.replacementRequestId, (counts.get(intent.replacementRequestId) ?? 0) + 1)
  }
  let topReplacement: string | null = null; let topReplacementCount = 0
  for (const [key, count] of counts) { if (count > topReplacementCount) { topReplacementCount = count; topReplacement = key } }
  return { totalIntents: total, uniqueReplacements: counts.size, topReplacement, topReplacementCount }
}
