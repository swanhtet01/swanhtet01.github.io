import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief = {
  totalIntents: number
  deliveryToDeliveryCount: number
  deliveryToPickupCount: number
  pickupToDeliveryCount: number
  pickupToPickupCount: number
  fromDeliveryCount: number
  fromPickupCount: number
}

export function projectEcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentFromFulfilmentToFulfilmentBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      deliveryToDeliveryCount: 0,
      deliveryToPickupCount: 0,
      pickupToDeliveryCount: 0,
      pickupToPickupCount: 0,
      fromDeliveryCount: 0,
      fromPickupCount: 0,
    }
  }

  let deliveryToDeliveryCount = 0
  let deliveryToPickupCount = 0
  let pickupToDeliveryCount = 0
  let pickupToPickupCount = 0

  for (const intent of buying.amendmentIntents) {
    const isFromDelivery = intent.fromFulfilment === 'delivery'
    const isToDelivery = intent.toFulfilment === 'delivery'
    if (isFromDelivery) {
      if (isToDelivery) deliveryToDeliveryCount++
      else deliveryToPickupCount++
    } else {
      if (isToDelivery) pickupToDeliveryCount++
      else pickupToPickupCount++
    }
  }

  return {
    totalIntents: total,
    deliveryToDeliveryCount,
    deliveryToPickupCount,
    pickupToDeliveryCount,
    pickupToPickupCount,
    fromDeliveryCount: deliveryToDeliveryCount + deliveryToPickupCount,
    fromPickupCount: pickupToDeliveryCount + pickupToPickupCount,
  }
}
