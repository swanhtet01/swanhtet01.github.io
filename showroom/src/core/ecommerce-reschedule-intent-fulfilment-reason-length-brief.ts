import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentFulfilmentReasonLengthBrief = {
  totalIntents: number
  pickupShortCount: number
  pickupDetailedCount: number
  deliveryShortCount: number
  deliveryDetailedCount: number
  pickupCount: number
  deliveryCount: number
}

export function projectEcommerceRescheduleIntentFulfilmentReasonLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentFulfilmentReasonLengthBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      pickupShortCount: 0,
      pickupDetailedCount: 0,
      deliveryShortCount: 0,
      deliveryDetailedCount: 0,
      pickupCount: 0,
      deliveryCount: 0,
    }
  }

  let pickupShortCount = 0
  let pickupDetailedCount = 0
  let deliveryShortCount = 0
  let deliveryDetailedCount = 0

  for (const intent of buying.rescheduleIntents) {
    const isPickup = intent.fulfilment === 'pickup'
    const isShort = intent.reason.length <= 40
    if (isPickup) {
      if (isShort) pickupShortCount++
      else pickupDetailedCount++
    } else {
      if (isShort) deliveryShortCount++
      else deliveryDetailedCount++
    }
  }

  return {
    totalIntents: total,
    pickupShortCount,
    pickupDetailedCount,
    deliveryShortCount,
    deliveryDetailedCount,
    pickupCount: pickupShortCount + pickupDetailedCount,
    deliveryCount: deliveryShortCount + deliveryDetailedCount,
  }
}
