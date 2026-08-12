import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationDecisionPaymentStatusBrief = {
  totalDecisions: number; pendingCount: number; reconciledCount: number
}
export function projectEcommerceCancellationDecisionPaymentStatusBrief(buying: EcommerceBuyingState): EcommerceCancellationDecisionPaymentStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) return { totalDecisions: 0, pendingCount: 0, reconciledCount: 0 }
  let pendingCount = 0; let reconciledCount = 0
  for (const decision of buying.cancellationDecisions) {
    if (decision.paymentStatus === 'pending') pendingCount++
    else reconciledCount++
  }
  return { totalDecisions: total, pendingCount, reconciledCount }
}
