import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderCancelledPaymentStatusBrief = {
  totalDecisions: number
  cancelledPendingCount: number
  cancelledReconciledCount: number
  notCancelledPendingCount: number
  notCancelledReconciledCount: number
  cancelledCount: number
  notCancelledCount: number
}

export function projectEcommerceCancellationDecisionOrderCancelledPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderCancelledPaymentStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      cancelledPendingCount: 0,
      cancelledReconciledCount: 0,
      notCancelledPendingCount: 0,
      notCancelledReconciledCount: 0,
      cancelledCount: 0,
      notCancelledCount: 0,
    }
  }

  let cancelledPendingCount = 0
  let cancelledReconciledCount = 0
  let notCancelledPendingCount = 0
  let notCancelledReconciledCount = 0

  for (const decision of buying.cancellationDecisions) {
    const isPending = decision.paymentStatus === 'pending'
    if (decision.orderCancelled) {
      if (isPending) cancelledPendingCount++
      else cancelledReconciledCount++
    } else {
      if (isPending) notCancelledPendingCount++
      else notCancelledReconciledCount++
    }
  }

  return {
    totalDecisions: total,
    cancelledPendingCount,
    cancelledReconciledCount,
    notCancelledPendingCount,
    notCancelledReconciledCount,
    cancelledCount: cancelledPendingCount + cancelledReconciledCount,
    notCancelledCount: notCancelledPendingCount + notCancelledReconciledCount,
  }
}
