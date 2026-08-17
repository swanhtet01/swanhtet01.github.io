import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentOrderCancelledRatesBrief = {
  totalIntents: number
  orderCancelledCount: number
  orderCancelledRate: number
  notOrderCancelledCount: number
  notOrderCancelledRate: number
}

export function projectEcommerceCancellationIntentOrderCancelledRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentOrderCancelledRatesBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderCancelledCount: 0,
      orderCancelledRate: 0,
      notOrderCancelledCount: 0,
      notOrderCancelledRate: 0,
    }
  }

  let orderCancelledCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.orderCancelled) orderCancelledCount++
  }

  const notOrderCancelledCount = total - orderCancelledCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    orderCancelledCount,
    orderCancelledRate: rate(orderCancelledCount),
    notOrderCancelledCount,
    notOrderCancelledRate: rate(notOrderCancelledCount),
  }
}
