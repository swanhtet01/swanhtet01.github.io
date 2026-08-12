import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentFromFulfilmentOrderStatusBrief = {
  totalIntents: number
  fromDeliveryConfirmedCount: number
  fromDeliveryPreparingCount: number
  fromDeliveryReadyCount: number
  fromPickupConfirmedCount: number
  fromPickupPreparingCount: number
  fromPickupReadyCount: number
}

export function projectEcommerceAmendmentIntentFromFulfilmentOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentFromFulfilmentOrderStatusBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      fromDeliveryConfirmedCount: 0,
      fromDeliveryPreparingCount: 0,
      fromDeliveryReadyCount: 0,
      fromPickupConfirmedCount: 0,
      fromPickupPreparingCount: 0,
      fromPickupReadyCount: 0,
    }
  }

  let fromDeliveryConfirmedCount = 0
  let fromDeliveryPreparingCount = 0
  let fromDeliveryReadyCount = 0
  let fromPickupConfirmedCount = 0
  let fromPickupPreparingCount = 0
  let fromPickupReadyCount = 0

  for (const intent of buying.amendmentIntents) {
    const isFromDelivery = intent.fromFulfilment === 'delivery'
    if (isFromDelivery) {
      if (intent.orderStatus === 'confirmed') fromDeliveryConfirmedCount++
      else if (intent.orderStatus === 'preparing') fromDeliveryPreparingCount++
      else fromDeliveryReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') fromPickupConfirmedCount++
      else if (intent.orderStatus === 'preparing') fromPickupPreparingCount++
      else fromPickupReadyCount++
    }
  }

  return {
    totalIntents: total,
    fromDeliveryConfirmedCount,
    fromDeliveryPreparingCount,
    fromDeliveryReadyCount,
    fromPickupConfirmedCount,
    fromPickupPreparingCount,
    fromPickupReadyCount,
  }
}
