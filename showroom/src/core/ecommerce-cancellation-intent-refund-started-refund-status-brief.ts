import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentRefundStartedRefundStatusBrief = {
  totalIntents: number
  refundStartedNoneCount: number
  refundStartedDueCount: number
  refundStartedSettledCount: number
  noRefundNoneCount: number
  noRefundDueCount: number
  noRefundSettledCount: number
}

export function projectEcommerceCancellationIntentRefundStartedRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentRefundStartedRefundStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedNoneCount: 0,
      refundStartedDueCount: 0,
      refundStartedSettledCount: 0,
      noRefundNoneCount: 0,
      noRefundDueCount: 0,
      noRefundSettledCount: 0,
    }
  }

  let refundStartedNoneCount = 0
  let refundStartedDueCount = 0
  let refundStartedSettledCount = 0
  let noRefundNoneCount = 0
  let noRefundDueCount = 0
  let noRefundSettledCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.refundStarted) {
      if (intent.refundStatus === 'none') refundStartedNoneCount++
      else if (intent.refundStatus === 'due') refundStartedDueCount++
      else refundStartedSettledCount++
    } else {
      if (intent.refundStatus === 'none') noRefundNoneCount++
      else if (intent.refundStatus === 'due') noRefundDueCount++
      else noRefundSettledCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedNoneCount,
    refundStartedDueCount,
    refundStartedSettledCount,
    noRefundNoneCount,
    noRefundDueCount,
    noRefundSettledCount,
  }
}
