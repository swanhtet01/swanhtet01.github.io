import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentPaymentStatusRefundStatusBrief = {
  totalIntents: number
  pendingNoneCount: number
  pendingDueCount: number
  pendingSettledCount: number
  reconciledNoneCount: number
  reconciledDueCount: number
  reconciledSettledCount: number
}

export function projectEcommerceCancellationIntentPaymentStatusRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentPaymentStatusRefundStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      pendingNoneCount: 0,
      pendingDueCount: 0,
      pendingSettledCount: 0,
      reconciledNoneCount: 0,
      reconciledDueCount: 0,
      reconciledSettledCount: 0,
    }
  }

  let pendingNoneCount = 0
  let pendingDueCount = 0
  let pendingSettledCount = 0
  let reconciledNoneCount = 0
  let reconciledDueCount = 0
  let reconciledSettledCount = 0

  for (const intent of buying.cancellationIntents) {
    const isPending = intent.paymentStatus === 'pending'
    if (isPending) {
      if (intent.refundStatus === 'none') pendingNoneCount++
      else if (intent.refundStatus === 'due') pendingDueCount++
      else pendingSettledCount++
    } else {
      if (intent.refundStatus === 'none') reconciledNoneCount++
      else if (intent.refundStatus === 'due') reconciledDueCount++
      else reconciledSettledCount++
    }
  }

  return {
    totalIntents: total,
    pendingNoneCount,
    pendingDueCount,
    pendingSettledCount,
    reconciledNoneCount,
    reconciledDueCount,
    reconciledSettledCount,
  }
}
