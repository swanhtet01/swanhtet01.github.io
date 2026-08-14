import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentDirectionReasonLengthBrief = {
  totalIntents: number
  forwardShortCount: number
  forwardDetailedCount: number
  pushedBackShortCount: number
  pushedBackDetailedCount: number
  forwardCount: number
  pushedBackCount: number
}

export function projectEcommerceRescheduleIntentDirectionReasonLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentDirectionReasonLengthBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      forwardShortCount: 0,
      forwardDetailedCount: 0,
      pushedBackShortCount: 0,
      pushedBackDetailedCount: 0,
      forwardCount: 0,
      pushedBackCount: 0,
    }
  }

  let forwardShortCount = 0
  let forwardDetailedCount = 0
  let pushedBackShortCount = 0
  let pushedBackDetailedCount = 0

  for (const intent of buying.rescheduleIntents) {
    const isForward = intent.requestedPromisedAt < intent.originalPromisedAt
    const isShort = intent.reason.length <= 40
    if (isForward) {
      if (isShort) forwardShortCount++
      else forwardDetailedCount++
    } else {
      if (isShort) pushedBackShortCount++
      else pushedBackDetailedCount++
    }
  }

  return {
    totalIntents: total,
    forwardShortCount,
    forwardDetailedCount,
    pushedBackShortCount,
    pushedBackDetailedCount,
    forwardCount: forwardShortCount + forwardDetailedCount,
    pushedBackCount: pushedBackShortCount + pushedBackDetailedCount,
  }
}
