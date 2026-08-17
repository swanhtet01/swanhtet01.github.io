import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentPaymentStatusRatesBrief = {
  totalIntents: number
  pendingCount: number
  pendingRate: number
  reconciledCount: number
  reconciledRate: number
}

export function projectEcommerceCancellationIntentPaymentStatusRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentPaymentStatusRatesBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      pendingCount: 0,
      pendingRate: 0,
      reconciledCount: 0,
      reconciledRate: 0,
    }
  }

  let pendingCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.paymentStatus === 'pending') pendingCount++
  }

  const reconciledCount = total - pendingCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    pendingCount,
    pendingRate: rate(pendingCount),
    reconciledCount,
    reconciledRate: rate(reconciledCount),
  }
}
