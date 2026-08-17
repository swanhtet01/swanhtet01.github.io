import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentOrderCancelledRefundStatusBrief = {
  totalIntents: number
  cancelledNoneCount: number
  cancelledDueCount: number
  cancelledSettledCount: number
  notCancelledNoneCount: number
  notCancelledDueCount: number
  notCancelledSettledCount: number
}

export function projectEcommerceCancellationIntentOrderCancelledRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentOrderCancelledRefundStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      cancelledNoneCount: 0,
      cancelledDueCount: 0,
      cancelledSettledCount: 0,
      notCancelledNoneCount: 0,
      notCancelledDueCount: 0,
      notCancelledSettledCount: 0,
    }
  }

  let cancelledNoneCount = 0
  let cancelledDueCount = 0
  let cancelledSettledCount = 0
  let notCancelledNoneCount = 0
  let notCancelledDueCount = 0
  let notCancelledSettledCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.orderCancelled) {
      if (intent.refundStatus === 'none') cancelledNoneCount++
      else if (intent.refundStatus === 'due') cancelledDueCount++
      else cancelledSettledCount++
    } else {
      if (intent.refundStatus === 'none') notCancelledNoneCount++
      else if (intent.refundStatus === 'due') notCancelledDueCount++
      else notCancelledSettledCount++
    }
  }

  return {
    totalIntents: total,
    cancelledNoneCount,
    cancelledDueCount,
    cancelledSettledCount,
    notCancelledNoneCount,
    notCancelledDueCount,
    notCancelledSettledCount,
  }
}
