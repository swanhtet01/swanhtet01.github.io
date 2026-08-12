import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCorrectionIntentSourceCorrectionCountBrief = {
  totalIntents: number; firstCorrectionCount: number; repeatCorrectionCount: number
}
export function projectEcommerceCorrectionIntentSourceCorrectionCountBrief(buying: EcommerceBuyingState): EcommerceCorrectionIntentSourceCorrectionCountBrief {
  const total = buying.correctionIntents.length
  if (total === 0) return { totalIntents: 0, firstCorrectionCount: 0, repeatCorrectionCount: 0 }
  let firstCorrectionCount = 0; let repeatCorrectionCount = 0
  for (const intent of buying.correctionIntents) {
    if (intent.sourceCorrectionCount === 0) firstCorrectionCount++
    else repeatCorrectionCount++
  }
  return { totalIntents: total, firstCorrectionCount, repeatCorrectionCount }
}
