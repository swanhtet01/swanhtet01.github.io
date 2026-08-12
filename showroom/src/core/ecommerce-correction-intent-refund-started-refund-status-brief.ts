import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRefundStartedRefundStatusBrief = {
  totalIntents: number
  refundStartedNoRefundCount: number
  refundStartedDueCount: number
  refundStartedSettledCount: number
  noRefundStartedNoRefundCount: number
  noRefundStartedDueCount: number
  noRefundStartedSettledCount: number
}

export function projectEcommerceCorrectionIntentRefundStartedRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRefundStartedRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedNoRefundCount: 0,
      refundStartedDueCount: 0,
      refundStartedSettledCount: 0,
      noRefundStartedNoRefundCount: 0,
      noRefundStartedDueCount: 0,
      noRefundStartedSettledCount: 0,
    }
  }

  let refundStartedNoRefundCount = 0
  let refundStartedDueCount = 0
  let refundStartedSettledCount = 0
  let noRefundStartedNoRefundCount = 0
  let noRefundStartedDueCount = 0
  let noRefundStartedSettledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.refundStarted) {
      if (intent.refundStatus === 'none') refundStartedNoRefundCount++
      else if (intent.refundStatus === 'due') refundStartedDueCount++
      else refundStartedSettledCount++
    } else {
      if (intent.refundStatus === 'none') noRefundStartedNoRefundCount++
      else if (intent.refundStatus === 'due') noRefundStartedDueCount++
      else noRefundStartedSettledCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedNoRefundCount,
    refundStartedDueCount,
    refundStartedSettledCount,
    noRefundStartedNoRefundCount,
    noRefundStartedDueCount,
    noRefundStartedSettledCount,
  }
}
