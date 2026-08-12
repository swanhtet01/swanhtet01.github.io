import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentSourceCountRefundStatusBrief = {
  totalIntents: number
  firstNoneCount: number
  firstDueCount: number
  firstSettledCount: number
  repeatNoneCount: number
  repeatDueCount: number
  repeatSettledCount: number
}

export function projectEcommerceCorrectionIntentSourceCountRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentSourceCountRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      firstNoneCount: 0,
      firstDueCount: 0,
      firstSettledCount: 0,
      repeatNoneCount: 0,
      repeatDueCount: 0,
      repeatSettledCount: 0,
    }
  }

  let firstNoneCount = 0
  let firstDueCount = 0
  let firstSettledCount = 0
  let repeatNoneCount = 0
  let repeatDueCount = 0
  let repeatSettledCount = 0

  for (const intent of buying.correctionIntents) {
    const isFirst = intent.sourceCorrectionCount === 0
    if (intent.refundStatus === 'none') {
      if (isFirst) firstNoneCount++
      else repeatNoneCount++
    } else if (intent.refundStatus === 'due') {
      if (isFirst) firstDueCount++
      else repeatDueCount++
    } else {
      if (isFirst) firstSettledCount++
      else repeatSettledCount++
    }
  }

  return {
    totalIntents: total,
    firstNoneCount,
    firstDueCount,
    firstSettledCount,
    repeatNoneCount,
    repeatDueCount,
    repeatSettledCount,
  }
}
