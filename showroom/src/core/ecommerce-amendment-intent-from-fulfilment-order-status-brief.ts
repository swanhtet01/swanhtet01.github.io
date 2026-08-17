import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentFromFulfilmentOrderStatusBrief = {
  totalIntents: number
  deliveryConfirmedCount: number
  deliveryPreparingCount: number
  deliveryReadyCount: number
  pickupConfirmedCount: number
  pickupPreparingCount: number
  pickupReadyCount: number
}

export function projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentFromFulfilmentOrderStatusBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      deliveryConfirmedCount: 0,
      deliveryPreparingCount: 0,
      deliveryReadyCount: 0,
      pickupConfirmedCount: 0,
      pickupPreparingCount: 0,
      pickupReadyCount: 0,
    }
  }

  let deliveryConfirmedCount = 0
  let deliveryPreparingCount = 0
  let deliveryReadyCount = 0
  let pickupConfirmedCount = 0
  let pickupPreparingCount = 0
  let pickupReadyCount = 0

  for (const intent of buying.amendmentIntents) {
    if (intent.fromFulfilment === 'delivery') {
      if (intent.orderStatus === 'confirmed') deliveryConfirmedCount++
      else if (intent.orderStatus === 'preparing') deliveryPreparingCount++
      else deliveryReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') pickupConfirmedCount++
      else if (intent.orderStatus === 'preparing') pickupPreparingCount++
      else pickupReadyCount++
    }
  }

  return {
    totalIntents: total,
    deliveryConfirmedCount,
    deliveryPreparingCount,
    deliveryReadyCount,
    pickupConfirmedCount,
    pickupPreparingCount,
    pickupReadyCount,
  }
}
