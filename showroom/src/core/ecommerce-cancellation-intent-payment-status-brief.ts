import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentPaymentStatusBrief = {
  totalCancellationIntents: number
  pendingPaymentCount: number
  reconciledPaymentCount: number
  pendingPaymentRate: number
  reconciledPaymentRate: number
}

export function projectEcommerceCancellationIntentPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentPaymentStatusBrief {
  let pendingPaymentCount = 0
  let reconciledPaymentCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.paymentStatus === 'reconciled') reconciledPaymentCount++
    else pendingPaymentCount++
  }

  const totalCancellationIntents = pendingPaymentCount + reconciledPaymentCount

  return {
    totalCancellationIntents,
    pendingPaymentCount,
    reconciledPaymentCount,
    pendingPaymentRate:
      totalCancellationIntents > 0
        ? Math.round((pendingPaymentCount / totalCancellationIntents) * 100)
        : 0,
    reconciledPaymentRate:
      totalCancellationIntents > 0
        ? Math.round((reconciledPaymentCount / totalCancellationIntents) * 100)
        : 0,
  }
}
