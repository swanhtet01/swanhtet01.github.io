import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceAmendmentIntentLineCountBrief = {
  totalIntents: number; singleLineCount: number; multiLineCount: number
}
export function projectEcommerceAmendmentIntentLineCountBrief(buying: EcommerceBuyingState): EcommerceAmendmentIntentLineCountBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) return { totalIntents: 0, singleLineCount: 0, multiLineCount: 0 }
  let singleLineCount = 0; let multiLineCount = 0
  for (const intent of buying.amendmentIntents) {
    if (intent.lineChanges.length === 1) singleLineCount++
    else multiLineCount++
  }
  return { totalIntents: total, singleLineCount, multiLineCount }
}
