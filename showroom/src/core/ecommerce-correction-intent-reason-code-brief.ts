import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCorrectionIntentReasonCodeBrief = {
  totalIntents: number; uniqueReasonCodes: number; topReasonCode: string | null; topReasonCodeCount: number
}
export function projectEcommerceCorrectionIntentReasonCodeBrief(buying: EcommerceBuyingState) {
  const total = buying.correctionIntents.length
  if (total === 0) return { totalIntents: 0, uniqueReasonCodes: 0, topReasonCode: null, topReasonCodeCount: 0 }
  const counts = new Map<string, number>()
  for (const intent of buying.correctionIntents) {
    counts.set(intent.reasonCode, (counts.get(intent.reasonCode) ?? 0) + 1)
  }
  let topReasonCode: string | null = null; let topReasonCodeCount = 0
  for (const [key, count] of counts) { if (count > topReasonCodeCount) { topReasonCodeCount = count; topReasonCode = key } }
  return { totalIntents: total, uniqueReasonCodes: counts.size, topReasonCode, topReasonCodeCount }
}
