import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderCancelledRatesBrief = {
  totalDecisions: number
  orderCancelledCount: number
  orderCancelledRate: number
  notOrderCancelledCount: number
  notOrderCancelledRate: number
}

export function projectEcommerceCancellationDecisionOrderCancelledRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderCancelledRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      orderCancelledCount: 0,
      orderCancelledRate: 0,
      notOrderCancelledCount: 0,
      notOrderCancelledRate: 0,
    }
  }

  let orderCancelledCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.orderCancelled) orderCancelledCount++
  }

  const notOrderCancelledCount = total - orderCancelledCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    orderCancelledCount,
    orderCancelledRate: rate(orderCancelledCount),
    notOrderCancelledCount,
    notOrderCancelledRate: rate(notOrderCancelledCount),
  }
}
