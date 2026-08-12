import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionPaymentStatusRatesBrief = {
  totalDecisions: number
  pendingCount: number
  pendingRate: number
  reconciledCount: number
  reconciledRate: number
}

export function projectEcommerceCancellationDecisionPaymentStatusRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionPaymentStatusRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      pendingCount: 0,
      pendingRate: 0,
      reconciledCount: 0,
      reconciledRate: 0,
    }
  }

  let pendingCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.paymentStatus === 'pending') pendingCount++
  }

  const reconciledCount = total - pendingCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    pendingCount,
    pendingRate: rate(pendingCount),
    reconciledCount,
    reconciledRate: rate(reconciledCount),
  }
}
