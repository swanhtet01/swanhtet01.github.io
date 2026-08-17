import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderStatusPaymentStatusBrief = {
  totalDecisions: number
  confirmedPendingCount: number
  confirmedReconciledCount: number
  preparingPendingCount: number
  preparingReconciledCount: number
  readyPendingCount: number
  readyReconciledCount: number
}

export function projectEcommerceCancellationDecisionOrderStatusPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderStatusPaymentStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      confirmedPendingCount: 0,
      confirmedReconciledCount: 0,
      preparingPendingCount: 0,
      preparingReconciledCount: 0,
      readyPendingCount: 0,
      readyReconciledCount: 0,
    }
  }

  let confirmedPendingCount = 0
  let confirmedReconciledCount = 0
  let preparingPendingCount = 0
  let preparingReconciledCount = 0
  let readyPendingCount = 0
  let readyReconciledCount = 0

  for (const decision of buying.cancellationDecisions) {
    const isPending = decision.paymentStatus === 'pending'
    if (decision.orderStatus === 'confirmed') {
      if (isPending) confirmedPendingCount++
      else confirmedReconciledCount++
    } else if (decision.orderStatus === 'preparing') {
      if (isPending) preparingPendingCount++
      else preparingReconciledCount++
    } else {
      if (isPending) readyPendingCount++
      else readyReconciledCount++
    }
  }

  return {
    totalDecisions: total,
    confirmedPendingCount,
    confirmedReconciledCount,
    preparingPendingCount,
    preparingReconciledCount,
    readyPendingCount,
    readyReconciledCount,
  }
}
