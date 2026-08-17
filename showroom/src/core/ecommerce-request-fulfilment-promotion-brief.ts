import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestFulfilmentPromotionBrief = {
  totalRequests: number
  deliveryWithPromoCount: number
  deliveryWithoutPromoCount: number
  pickupWithPromoCount: number
  pickupWithoutPromoCount: number
  deliveryCount: number
  pickupCount: number
}

export function projectEcommerceRequestFulfilmentPromotionBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestFulfilmentPromotionBrief {
  const total = buying.requests.length
  if (total === 0) {
    return {
      totalRequests: 0,
      deliveryWithPromoCount: 0,
      deliveryWithoutPromoCount: 0,
      pickupWithPromoCount: 0,
      pickupWithoutPromoCount: 0,
      deliveryCount: 0,
      pickupCount: 0,
    }
  }

  let deliveryWithPromoCount = 0
  let deliveryWithoutPromoCount = 0
  let pickupWithPromoCount = 0
  let pickupWithoutPromoCount = 0

  for (const request of buying.requests) {
    const isDelivery = request.fulfilment === 'delivery'
    const hasPromo = request.quote.promotion.code !== null
    if (isDelivery) {
      if (hasPromo) deliveryWithPromoCount++
      else deliveryWithoutPromoCount++
    } else {
      if (hasPromo) pickupWithPromoCount++
      else pickupWithoutPromoCount++
    }
  }

  return {
    totalRequests: total,
    deliveryWithPromoCount,
    deliveryWithoutPromoCount,
    pickupWithPromoCount,
    pickupWithoutPromoCount,
    deliveryCount: deliveryWithPromoCount + deliveryWithoutPromoCount,
    pickupCount: pickupWithPromoCount + pickupWithoutPromoCount,
  }
}
