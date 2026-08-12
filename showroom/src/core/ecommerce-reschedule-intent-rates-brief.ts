import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentRatesBrief = {
  totalIntents: number
  forwardCount: number
  forwardRate: number
  pushedBackCount: number
  pushedBackRate: number
  customerNotificationCount: number
  customerNotificationRate: number
}

export function projectEcommerceRescheduleIntentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      forwardCount: 0,
      forwardRate: 0,
      pushedBackCount: 0,
      pushedBackRate: 0,
      customerNotificationCount: 0,
      customerNotificationRate: 0,
    }
  }

  let forwardCount = 0
  let pushedBackCount = 0
  let customerNotificationCount = 0

  for (const intent of buying.rescheduleIntents) {
    if (intent.requestedPromisedAt < intent.originalPromisedAt) forwardCount++
    else pushedBackCount++
    if (intent.customerMessageSent) customerNotificationCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    forwardCount,
    forwardRate: rate(forwardCount),
    pushedBackCount,
    pushedBackRate: rate(pushedBackCount),
    customerNotificationCount,
    customerNotificationRate: rate(customerNotificationCount),
  }
}
