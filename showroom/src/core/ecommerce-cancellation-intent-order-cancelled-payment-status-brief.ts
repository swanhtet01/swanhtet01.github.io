import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentOrderCancelledPaymentStatusBrief = {
  totalIntents: number
  cancelledPendingCount: number
  cancelledReconciledCount: number
  notCancelledPendingCount: number
  notCancelledReconciledCount: number
  cancelledCount: number
  notCancelledCount: number
}

export function projectEcommerceCancellationIntentOrderCancelledPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentOrderCancelledPaymentStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
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

  for (const intent of buying.cancellationIntents) {
    const isPending = intent.paymentStatus === 'pending'
    if (intent.orderCancelled) {
      if (isPending) cancelledPendingCount++
      else cancelledReconciledCount++
    } else {
      if (isPending) notCancelledPendingCount++
      else notCancelledReconciledCount++
    }
  }

  return {
    totalIntents: total,
    cancelledPendingCount,
    cancelledReconciledCount,
    notCancelledPendingCount,
    notCancelledReconciledCount,
    cancelledCount: cancelledPendingCount + cancelledReconciledCount,
    notCancelledCount: notCancelledPendingCount + notCancelledReconciledCount,
  }
}
