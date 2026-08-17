import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentToFulfilmentOrderStatusBrief = {
  totalIntents: number
  toDeliveryConfirmedCount: number
  toDeliveryPreparingCount: number
  toDeliveryReadyCount: number
  toPickupConfirmedCount: number
  toPickupPreparingCount: number
  toPickupReadyCount: number
}

export function projectEcommerceAmendmentIntentToFulfilmentOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentToFulfilmentOrderStatusBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      toDeliveryConfirmedCount: 0,
      toDeliveryPreparingCount: 0,
      toDeliveryReadyCount: 0,
      toPickupConfirmedCount: 0,
      toPickupPreparingCount: 0,
      toPickupReadyCount: 0,
    }
  }

  let toDeliveryConfirmedCount = 0
  let toDeliveryPreparingCount = 0
  let toDeliveryReadyCount = 0
  let toPickupConfirmedCount = 0
  let toPickupPreparingCount = 0
  let toPickupReadyCount = 0

  for (const intent of buying.amendmentIntents) {
    if (intent.toFulfilment === 'delivery') {
      if (intent.orderStatus === 'confirmed') toDeliveryConfirmedCount++
      else if (intent.orderStatus === 'preparing') toDeliveryPreparingCount++
      else toDeliveryReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') toPickupConfirmedCount++
      else if (intent.orderStatus === 'preparing') toPickupPreparingCount++
      else toPickupReadyCount++
    }
  }

  return {
    totalIntents: total,
    toDeliveryConfirmedCount,
    toDeliveryPreparingCount,
    toDeliveryReadyCount,
    toPickupConfirmedCount,
    toPickupPreparingCount,
    toPickupReadyCount,
  }
}
