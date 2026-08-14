import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionRefundStartedPaymentStatusBrief = {
  totalDecisions: number
  refundStartedPendingCount: number
  refundStartedReconciledCount: number
  noRefundPendingCount: number
  noRefundReconciledCount: number
  refundStartedCount: number
  noRefundCount: number
}

export function projectEcommerceCancellationDecisionRefundStartedPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionRefundStartedPaymentStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
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

  for (const decision of buying.cancellationDecisions) {
    const isPending = decision.paymentStatus === 'pending'
    if (decision.refundStarted) {
      if (isPending) refundStartedPendingCount++
      else refundStartedReconciledCount++
    } else {
      if (isPending) noRefundPendingCount++
      else noRefundReconciledCount++
    }
  }

  return {
    totalDecisions: total,
    refundStartedPendingCount,
    refundStartedReconciledCount,
    noRefundPendingCount,
    noRefundReconciledCount,
    refundStartedCount: refundStartedPendingCount + refundStartedReconciledCount,
    noRefundCount: noRefundPendingCount + noRefundReconciledCount,
  }
}
