import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentFulfilmentValueBrief = {
  totalIntents: number
  pickupToPickupCount: number
  pickupToDeliveryCount: number
  deliveryToPickupCount: number
  deliveryToDeliveryCount: number
  pickupToPickupRate: number
  pickupToDeliveryRate: number
  deliveryToPickupRate: number
  deliveryToDeliveryRate: number
  totalOriginalValueMmk: number
  minOriginalValueMmk: number | null
  maxOriginalValueMmk: number | null
  averageOriginalValueMmk: number
}

export function projectEcommerceAmendmentIntentFulfilmentValueBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentFulfilmentValueBrief {
  let pickupToPickupCount = 0
  let pickupToDeliveryCount = 0
  let deliveryToPickupCount = 0
  let deliveryToDeliveryCount = 0
  let totalOriginalValueMmk = 0
  let minOriginalValueMmk: number | null = null
  let maxOriginalValueMmk: number | null = null

  for (const intent of buying.amendmentIntents) {
    if (intent.fromFulfilment === 'pickup' && intent.toFulfilment === 'pickup') pickupToPickupCount++
    else if (intent.fromFulfilment === 'pickup' && intent.toFulfilment === 'delivery') pickupToDeliveryCount++
    else if (intent.fromFulfilment === 'delivery' && intent.toFulfilment === 'pickup') deliveryToPickupCount++
    else deliveryToDeliveryCount++
    totalOriginalValueMmk += intent.originalTotalMmk
    if (minOriginalValueMmk === null || intent.originalTotalMmk < minOriginalValueMmk)
      minOriginalValueMmk = intent.originalTotalMmk
    if (maxOriginalValueMmk === null || intent.originalTotalMmk > maxOriginalValueMmk)
      maxOriginalValueMmk = intent.originalTotalMmk
  }

  const totalIntents = buying.amendmentIntents.length

  return {
    totalIntents,
    pickupToPickupCount,
    pickupToDeliveryCount,
    deliveryToPickupCount,
    deliveryToDeliveryCount,
    pickupToPickupRate: totalIntents > 0 ? Math.round((pickupToPickupCount / totalIntents) * 100) : 0,
    pickupToDeliveryRate: totalIntents > 0 ? Math.round((pickupToDeliveryCount / totalIntents) * 100) : 0,
    deliveryToPickupRate: totalIntents > 0 ? Math.round((deliveryToPickupCount / totalIntents) * 100) : 0,
    deliveryToDeliveryRate: totalIntents > 0 ? Math.round((deliveryToDeliveryCount / totalIntents) * 100) : 0,
    totalOriginalValueMmk,
    minOriginalValueMmk,
    maxOriginalValueMmk,
    averageOriginalValueMmk: totalIntents > 0 ? Math.round(totalOriginalValueMmk / totalIntents) : 0,
  }
}
