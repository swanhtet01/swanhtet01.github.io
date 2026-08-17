import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentDirectionRatesBrief = {
  totalIntents: number
  forwardCount: number
  forwardRate: number
  pushedBackCount: number
  pushedBackRate: number
}

export function projectEcommerceRescheduleIntentDirectionRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentDirectionRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      forwardCount: 0,
      forwardRate: 0,
      pushedBackCount: 0,
      pushedBackRate: 0,
    }
  }

  let forwardCount = 0

  for (const intent of buying.rescheduleIntents) {
    if (intent.requestedPromisedAt < intent.originalPromisedAt) forwardCount++
  }

  const pushedBackCount = total - forwardCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    forwardCount,
    forwardRate: rate(forwardCount),
    pushedBackCount,
    pushedBackRate: rate(pushedBackCount),
  }
}
