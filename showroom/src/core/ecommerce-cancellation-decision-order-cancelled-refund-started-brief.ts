import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderCancelledRefundStartedBrief = {
  totalDecisions: number
  cancelledRefundStartedCount: number
  cancelledNoRefundCount: number
  notCancelledRefundStartedCount: number
  notCancelledNoRefundCount: number
  cancelledCount: number
  notCancelledCount: number
}

export function projectEcommerceCancellationDecisionOrderCancelledRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderCancelledRefundStartedBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      cancelledRefundStartedCount: 0,
      cancelledNoRefundCount: 0,
      notCancelledRefundStartedCount: 0,
      notCancelledNoRefundCount: 0,
      cancelledCount: 0,
      notCancelledCount: 0,
    }
  }

  let cancelledRefundStartedCount = 0
  let cancelledNoRefundCount = 0
  let notCancelledRefundStartedCount = 0
  let notCancelledNoRefundCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.orderCancelled) {
      if (decision.refundStarted) cancelledRefundStartedCount++
      else cancelledNoRefundCount++
    } else {
      if (decision.refundStarted) notCancelledRefundStartedCount++
      else notCancelledNoRefundCount++
    }
  }

  return {
    totalDecisions: total,
    cancelledRefundStartedCount,
    cancelledNoRefundCount,
    notCancelledRefundStartedCount,
    notCancelledNoRefundCount,
    cancelledCount: cancelledRefundStartedCount + cancelledNoRefundCount,
    notCancelledCount: notCancelledRefundStartedCount + notCancelledNoRefundCount,
  }
}
