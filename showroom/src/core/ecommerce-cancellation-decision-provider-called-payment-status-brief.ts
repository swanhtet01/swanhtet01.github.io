import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionProviderCalledPaymentStatusBrief = {
  totalDecisions: number
  providerCalledPendingCount: number
  providerCalledReconciledCount: number
  noProviderPendingCount: number
  noProviderReconciledCount: number
  providerCalledCount: number
  noProviderCount: number
}

export function projectEcommerceCancellationDecisionProviderCalledPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionProviderCalledPaymentStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      providerCalledPendingCount: 0,
      providerCalledReconciledCount: 0,
      noProviderPendingCount: 0,
      noProviderReconciledCount: 0,
      providerCalledCount: 0,
      noProviderCount: 0,
    }
  }

  let providerCalledPendingCount = 0
  let providerCalledReconciledCount = 0
  let noProviderPendingCount = 0
  let noProviderReconciledCount = 0

  for (const decision of buying.cancellationDecisions) {
    const isPending = decision.paymentStatus === 'pending'
    if (decision.providerCalled) {
      if (isPending) providerCalledPendingCount++
      else providerCalledReconciledCount++
    } else {
      if (isPending) noProviderPendingCount++
      else noProviderReconciledCount++
    }
  }

  return {
    totalDecisions: total,
    providerCalledPendingCount,
    providerCalledReconciledCount,
    noProviderPendingCount,
    noProviderReconciledCount,
    providerCalledCount: providerCalledPendingCount + providerCalledReconciledCount,
    noProviderCount: noProviderPendingCount + noProviderReconciledCount,
  }
}
