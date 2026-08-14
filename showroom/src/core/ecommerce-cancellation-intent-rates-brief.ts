import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentRatesBrief = {
  totalIntents: number
  orderCancelledCount: number
  orderCancelledRate: number
  customerNotificationCount: number
  customerNotificationRate: number
  refundStartedCount: number
  refundStartedRate: number
}

export function projectEcommerceCancellationIntentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentRatesBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderCancelledCount: 0,
      orderCancelledRate: 0,
      customerNotificationCount: 0,
      customerNotificationRate: 0,
      refundStartedCount: 0,
      refundStartedRate: 0,
    }
  }

  let orderCancelledCount = 0
  let customerNotificationCount = 0
  let refundStartedCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.orderCancelled) orderCancelledCount++
    if (intent.customerMessageSent) customerNotificationCount++
    if (intent.refundStarted) refundStartedCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    orderCancelledCount,
    orderCancelledRate: rate(orderCancelledCount),
    customerNotificationCount,
    customerNotificationRate: rate(customerNotificationCount),
    refundStartedCount,
    refundStartedRate: rate(refundStartedCount),
  }
}
