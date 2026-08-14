import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionPaymentValueBrief = {
  totalDecisions: number
  pendingCount: number
  reconciledCount: number
  pendingTotalMmk: number
  pendingAverageMmk: number
  reconciledTotalMmk: number
  reconciledAverageMmk: number
}

export function projectEcommerceCancellationDecisionPaymentValueBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionPaymentValueBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0)
    return { totalDecisions: 0, pendingCount: 0, reconciledCount: 0, pendingTotalMmk: 0, pendingAverageMmk: 0, reconciledTotalMmk: 0, reconciledAverageMmk: 0 }
  let pendingCount = 0; let reconciledCount = 0
  let pendingTotalMmk = 0; let reconciledTotalMmk = 0
  for (const decision of buying.cancellationDecisions) {
    if (decision.paymentStatus === 'pending') {
      pendingCount++
      pendingTotalMmk += decision.totalMmk
    } else {
      reconciledCount++
      reconciledTotalMmk += decision.totalMmk
    }
  }
  return {
    totalDecisions: total,
    pendingCount,
    reconciledCount,
    pendingTotalMmk,
    pendingAverageMmk: pendingCount > 0 ? Math.round(pendingTotalMmk / pendingCount) : 0,
    reconciledTotalMmk,
    reconciledAverageMmk: reconciledCount > 0 ? Math.round(reconciledTotalMmk / reconciledCount) : 0,
  }
}
