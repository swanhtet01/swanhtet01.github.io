import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionPaymentStatusBrief = {
  totalDecisions: number
  pending: number
  reconciled: number
  pendingRate: number
  reconciledRate: number
}

export function projectEcommerceCancellationDecisionPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionPaymentStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0)
    return { totalDecisions: 0, pending: 0, reconciled: 0, pendingRate: 0, reconciledRate: 0 }
  let pending = 0
  let reconciled = 0
  for (const decision of buying.cancellationDecisions) {
    if (decision.paymentStatus === 'pending') pending++
    else if (decision.paymentStatus === 'reconciled') reconciled++
  }
  return {
    totalDecisions: total,
    pending,
    reconciled,
    pendingRate: Math.round((pending / total) * 100),
    reconciledRate: Math.round((reconciled / total) * 100),
  }
}
