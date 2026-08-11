import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRefundStatusBrief = {
  totalIntents: number
  noneCount: number
  dueCount: number
  settledCount: number
  noneRate: number
  dueRate: number
  settledRate: number
}

export function projectEcommerceCorrectionIntentRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRefundStatusBrief {
  const intents = buying.correctionIntents
  const total = intents.length
  let noneCount = 0
  let dueCount = 0
  let settledCount = 0

  for (const intent of intents) {
    if (intent.refundStatus === 'none') noneCount++
    else if (intent.refundStatus === 'due') dueCount++
    else if (intent.refundStatus === 'settled') settledCount++
  }

  return {
    totalIntents: total,
    noneCount,
    dueCount,
    settledCount,
    noneRate: total > 0 ? Math.round((noneCount / total) * 100) : 0,
    dueRate: total > 0 ? Math.round((dueCount / total) * 100) : 0,
    settledRate: total > 0 ? Math.round((settledCount / total) * 100) : 0,
  }
}
