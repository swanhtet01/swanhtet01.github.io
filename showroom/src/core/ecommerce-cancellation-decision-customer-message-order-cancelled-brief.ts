import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionCustomerMessageOrderCancelledBrief = {
  totalDecisions: number
  messageSentCancelledCount: number
  messageSentNotCancelledCount: number
  noMessageCancelledCount: number
  noMessageNotCancelledCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCancellationDecisionCustomerMessageOrderCancelledBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionCustomerMessageOrderCancelledBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      messageSentCancelledCount: 0,
      messageSentNotCancelledCount: 0,
      noMessageCancelledCount: 0,
      noMessageNotCancelledCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentCancelledCount = 0
  let messageSentNotCancelledCount = 0
  let noMessageCancelledCount = 0
  let noMessageNotCancelledCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.customerMessageSent) {
      if (decision.orderCancelled) messageSentCancelledCount++
      else messageSentNotCancelledCount++
    } else {
      if (decision.orderCancelled) noMessageCancelledCount++
      else noMessageNotCancelledCount++
    }
  }

  return {
    totalDecisions: total,
    messageSentCancelledCount,
    messageSentNotCancelledCount,
    noMessageCancelledCount,
    noMessageNotCancelledCount,
    messageSentCount: messageSentCancelledCount + messageSentNotCancelledCount,
    noMessageCount: noMessageCancelledCount + noMessageNotCancelledCount,
  }
}
