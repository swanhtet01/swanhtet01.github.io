import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentFulfilmentDirectionBrief = {
  totalIntents: number
  pickupForwardCount: number
  pickupPushedBackCount: number
  deliveryForwardCount: number
  deliveryPushedBackCount: number
  pickupCount: number
  deliveryCount: number
  forwardCount: number
  pushedBackCount: number
}

export function projectEcommerceRescheduleIntentFulfilmentDirectionBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentFulfilmentDirectionBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      pickupForwardCount: 0,
      pickupPushedBackCount: 0,
      deliveryForwardCount: 0,
      deliveryPushedBackCount: 0,
      pickupCount: 0,
      deliveryCount: 0,
      forwardCount: 0,
      pushedBackCount: 0,
    }
  }

  let pickupForwardCount = 0
  let pickupPushedBackCount = 0
  let deliveryForwardCount = 0
  let deliveryPushedBackCount = 0

  for (const intent of buying.rescheduleIntents) {
    const isPickup = intent.fulfilment === 'pickup'
    const isForward = intent.requestedPromisedAt < intent.originalPromisedAt
    if (isPickup) {
      if (isForward) pickupForwardCount++
      else pickupPushedBackCount++
    } else {
      if (isForward) deliveryForwardCount++
      else deliveryPushedBackCount++
    }
  }

  return {
    totalIntents: total,
    pickupForwardCount,
    pickupPushedBackCount,
    deliveryForwardCount,
    deliveryPushedBackCount,
    pickupCount: pickupForwardCount + pickupPushedBackCount,
    deliveryCount: deliveryForwardCount + deliveryPushedBackCount,
    forwardCount: pickupForwardCount + deliveryForwardCount,
    pushedBackCount: pickupPushedBackCount + deliveryPushedBackCount,
  }
}
