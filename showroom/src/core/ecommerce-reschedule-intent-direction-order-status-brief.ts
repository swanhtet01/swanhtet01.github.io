import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentDirectionOrderStatusBrief = {
  totalIntents: number
  forwardConfirmedCount: number
  forwardPreparingCount: number
  forwardReadyCount: number
  pushedBackConfirmedCount: number
  pushedBackPreparingCount: number
  pushedBackReadyCount: number
}

export function projectEcommerceRescheduleIntentDirectionOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentDirectionOrderStatusBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      forwardConfirmedCount: 0,
      forwardPreparingCount: 0,
      forwardReadyCount: 0,
      pushedBackConfirmedCount: 0,
      pushedBackPreparingCount: 0,
      pushedBackReadyCount: 0,
    }
  }

  let forwardConfirmedCount = 0
  let forwardPreparingCount = 0
  let forwardReadyCount = 0
  let pushedBackConfirmedCount = 0
  let pushedBackPreparingCount = 0
  let pushedBackReadyCount = 0

  for (const intent of buying.rescheduleIntents) {
    const isForward = intent.requestedPromisedAt < intent.originalPromisedAt
    if (isForward) {
      if (intent.orderStatus === 'confirmed') forwardConfirmedCount++
      else if (intent.orderStatus === 'preparing') forwardPreparingCount++
      else forwardReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') pushedBackConfirmedCount++
      else if (intent.orderStatus === 'preparing') pushedBackPreparingCount++
      else pushedBackReadyCount++
    }
  }

  return {
    totalIntents: total,
    forwardConfirmedCount,
    forwardPreparingCount,
    forwardReadyCount,
    pushedBackConfirmedCount,
    pushedBackPreparingCount,
    pushedBackReadyCount,
  }
}
