import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCorrectionIntentRequestedKindBrief = {
  totalIntents: number; creditCount: number; debitCount: number
}
export function projectEcommerceCorrectionIntentRequestedKindBrief(buying: EcommerceBuyingState) {
  const total = buying.correctionIntents.length
  if (total === 0) return { totalIntents: 0, creditCount: 0, debitCount: 0 }
  let creditCount = 0; let debitCount = 0
  for (const intent of buying.correctionIntents) {
    if (intent.requestedKind === 'credit') creditCount++
    else debitCount++
  }
  return { totalIntents: total, creditCount, debitCount }
}
