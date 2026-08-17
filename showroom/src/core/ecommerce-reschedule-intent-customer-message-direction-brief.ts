import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentCustomerMessageDirectionBrief = {
  totalIntents: number
  messageSentForwardCount: number
  messageSentPushedBackCount: number
  noMessageForwardCount: number
  noMessagePushedBackCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceRescheduleIntentCustomerMessageDirectionBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentCustomerMessageDirectionBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentForwardCount: 0,
      messageSentPushedBackCount: 0,
      noMessageForwardCount: 0,
      noMessagePushedBackCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentForwardCount = 0
  let messageSentPushedBackCount = 0
  let noMessageForwardCount = 0
  let noMessagePushedBackCount = 0

  for (const intent of buying.rescheduleIntents) {
    const isForward = intent.requestedPromisedAt < intent.originalPromisedAt
    if (intent.customerMessageSent) {
      if (isForward) messageSentForwardCount++
      else messageSentPushedBackCount++
    } else {
      if (isForward) noMessageForwardCount++
      else noMessagePushedBackCount++
    }
  }

  return {
    totalIntents: total,
    messageSentForwardCount,
    messageSentPushedBackCount,
    noMessageForwardCount,
    noMessagePushedBackCount,
    messageSentCount: messageSentForwardCount + messageSentPushedBackCount,
    noMessageCount: noMessageForwardCount + noMessagePushedBackCount,
  }
}
