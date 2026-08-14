import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentCustomerMessageOrderCancelledBrief = {
  totalIntents: number
  messageSentCancelledCount: number
  messageSentNotCancelledCount: number
  noMessageCancelledCount: number
  noMessageNotCancelledCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCancellationIntentCustomerMessageOrderCancelledBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentCustomerMessageOrderCancelledBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
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

  for (const intent of buying.cancellationIntents) {
    if (intent.customerMessageSent) {
      if (intent.orderCancelled) messageSentCancelledCount++
      else messageSentNotCancelledCount++
    } else {
      if (intent.orderCancelled) noMessageCancelledCount++
      else noMessageNotCancelledCount++
    }
  }

  return {
    totalIntents: total,
    messageSentCancelledCount,
    messageSentNotCancelledCount,
    noMessageCancelledCount,
    noMessageNotCancelledCount,
    messageSentCount: messageSentCancelledCount + messageSentNotCancelledCount,
    noMessageCount: noMessageCancelledCount + noMessageNotCancelledCount,
  }
}
