import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCorrectionIntentRefundStatusBrief = {
  totalIntents: number; noneCount: number; dueCount: number; settledCount: number
}
export function projectEcommerceCorrectionIntentRefundStatusBrief(buying: EcommerceBuyingState): EcommerceCorrectionIntentRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) return { totalIntents: 0, noneCount: 0, dueCount: 0, settledCount: 0 }
  let noneCount = 0; let dueCount = 0; let settledCount = 0
  for (const intent of buying.correctionIntents) {
    if (intent.refundStatus === 'none') noneCount++
    else if (intent.refundStatus === 'due') dueCount++
    else settledCount++
  }
  return { totalIntents: total, noneCount, dueCount, settledCount }
}
