import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderCancelledProviderCalledBrief = {
  totalDecisions: number
  cancelledProviderCalledCount: number
  cancelledNoProviderCount: number
  notCancelledProviderCalledCount: number
  notCancelledNoProviderCount: number
  cancelledCount: number
  notCancelledCount: number
}

export function projectEcommerceCancellationDecisionOrderCancelledProviderCalledBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderCancelledProviderCalledBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      cancelledProviderCalledCount: 0,
      cancelledNoProviderCount: 0,
      notCancelledProviderCalledCount: 0,
      notCancelledNoProviderCount: 0,
      cancelledCount: 0,
      notCancelledCount: 0,
    }
  }

  let cancelledProviderCalledCount = 0
  let cancelledNoProviderCount = 0
  let notCancelledProviderCalledCount = 0
  let notCancelledNoProviderCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.orderCancelled) {
      if (decision.providerCalled) cancelledProviderCalledCount++
      else cancelledNoProviderCount++
    } else {
      if (decision.providerCalled) notCancelledProviderCalledCount++
      else notCancelledNoProviderCount++
    }
  }

  return {
    totalDecisions: total,
    cancelledProviderCalledCount,
    cancelledNoProviderCount,
    notCancelledProviderCalledCount,
    notCancelledNoProviderCount,
    cancelledCount: cancelledProviderCalledCount + cancelledNoProviderCount,
    notCancelledCount: notCancelledProviderCalledCount + notCancelledNoProviderCount,
  }
}
