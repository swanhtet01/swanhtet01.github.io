import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationIntentPaymentStatusBrief = {
  totalIntents: number; pendingCount: number; reconciledCount: number
}
export function projectEcommerceCancellationIntentPaymentStatusBrief(buying: EcommerceBuyingState): EcommerceCancellationIntentPaymentStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) return { totalIntents: 0, pendingCount: 0, reconciledCount: 0 }
  let pendingCount = 0; let reconciledCount = 0
  for (const intent of buying.cancellationIntents) {
    if (intent.paymentStatus === 'pending') pendingCount++
    else reconciledCount++
  }
  return { totalIntents: total, pendingCount, reconciledCount }
}
