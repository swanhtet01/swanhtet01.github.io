import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionRatesBrief = {
  totalDecisions: number
  orderCancelledCount: number
  orderCancelledRate: number
  customerNotificationCount: number
  customerNotificationRate: number
  refundStartedCount: number
  refundStartedRate: number
  providerEscalationCount: number
  providerEscalationRate: number
}

export function projectEcommerceCancellationDecisionRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      orderCancelledCount: 0,
      orderCancelledRate: 0,
      customerNotificationCount: 0,
      customerNotificationRate: 0,
      refundStartedCount: 0,
      refundStartedRate: 0,
      providerEscalationCount: 0,
      providerEscalationRate: 0,
    }
  }

  let orderCancelledCount = 0
  let customerNotificationCount = 0
  let refundStartedCount = 0
  let providerEscalationCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.orderCancelled) orderCancelledCount++
    if (decision.customerMessageSent) customerNotificationCount++
    if (decision.refundStarted) refundStartedCount++
    if (decision.providerCalled) providerEscalationCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    orderCancelledCount,
    orderCancelledRate: rate(orderCancelledCount),
    customerNotificationCount,
    customerNotificationRate: rate(customerNotificationCount),
    refundStartedCount,
    refundStartedRate: rate(refundStartedCount),
    providerEscalationCount,
    providerEscalationRate: rate(providerEscalationCount),
  }
}
