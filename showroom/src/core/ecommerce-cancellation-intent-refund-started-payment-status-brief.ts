import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentRefundStartedPaymentStatusBrief = {
  totalIntents: number
  refundStartedPendingCount: number
  refundStartedReconciledCount: number
  noRefundPendingCount: number
  noRefundReconciledCount: number
  refundStartedCount: number
  noRefundCount: number
}

export function projectEcommerceCancellationIntentRefundStartedPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentRefundStartedPaymentStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedPendingCount: 0,
      refundStartedReconciledCount: 0,
      noRefundPendingCount: 0,
      noRefundReconciledCount: 0,
      refundStartedCount: 0,
      noRefundCount: 0,
    }
  }

  let refundStartedPendingCount = 0
  let refundStartedReconciledCount = 0
  let noRefundPendingCount = 0
  let noRefundReconciledCount = 0

  for (const intent of buying.cancellationIntents) {
    const isPending = intent.paymentStatus === 'pending'
    if (intent.refundStarted) {
      if (isPending) refundStartedPendingCount++
      else refundStartedReconciledCount++
    } else {
      if (isPending) noRefundPendingCount++
      else noRefundReconciledCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedPendingCount,
    refundStartedReconciledCount,
    noRefundPendingCount,
    noRefundReconciledCount,
    refundStartedCount: refundStartedPendingCount + refundStartedReconciledCount,
    noRefundCount: noRefundPendingCount + noRefundReconciledCount,
  }
}
